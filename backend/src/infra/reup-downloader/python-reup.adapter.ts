import { spawn, type ChildProcess } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { SettingsService } from '../../modules/settings/settings.service';
import {
  DownloadFailedError,
  DownloaderContractMismatchError,
  DownloaderParseError,
  DownloaderTimeoutError,
  DownloaderUnavailableError,
  YoutubeNotConfiguredError,
  toDomainError,
} from './reup-downloader.errors';
import {
  REUP_CONTRACT_VERSION,
  type DownloadedFile,
  type DownloaderAvailability,
  type ReupDownloaderPort,
  type ReupSearchParams,
  type ReupVideoCandidate,
} from './reup-downloader.interface';

/** Timeout ngắn cho `checkAvailability` — chỉ hỏi version, không làm gì nặng. */
const AVAILABILITY_TIMEOUT_MS = 5_000;
const SEARCH_TIMEOUT_MS = 60_000;

/** Kết quả thô của một lần spawn. */
interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

/** Hình dạng chung của mọi response JSON từ Python. */
interface ContractEnvelope {
  contractVersion?: unknown;
  ok?: unknown;
  errorCode?: unknown;
  message?: unknown;
}

/**
 * Adapter gọi `ai-video-downloader` bằng **process con** (QĐ-1).
 *
 * Dùng `spawn` chứ **không** `exec`: `exec` đệm toàn bộ stdout trong RAM và có
 * trần mặc định — log rác hoặc kết quả lớn sẽ tràn buffer và mất dữ liệu.
 */
@Injectable()
export class PythonReupAdapter implements ReupDownloaderPort {
  private readonly logger = new Logger(PythonReupAdapter.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly settings: SettingsService,
  ) {}

  async search(params: ReupSearchParams): Promise<ReupVideoCandidate[]> {
    // Lấy key TRƯỚC khi spawn: chưa cấu hình thì không tốn một process nào.
    const apiKey = await this.getYoutubeApiKeyOrFail();

    const body = await this.runJson(
      [
        'yt-search',
        '--keyword',
        params.keyword,
        '--max',
        String(params.maxResults),
        '--region',
        params.regionCode,
        '--published-after',
        String(params.publishedAfterDays),
        '--json',
      ],
      SEARCH_TIMEOUT_MS,
      // Key đi qua ENV của process con, KHÔNG qua argv — argv hiện trong `ps`.
      { YOUTUBE_API_KEY: apiKey },
    );

    const videos = (body as { videos?: unknown }).videos;
    if (!Array.isArray(videos)) {
      throw new DownloaderParseError(JSON.stringify(body));
    }
    return videos.map((video) => toCandidate(video));
  }

  async download(params: {
    url: string;
    outDir: string;
  }): Promise<DownloadedFile> {
    const timeoutMs = this.config.reup.downloadTimeoutMs;
    const body = await this.runJson(
      [
        'yt-download',
        '--url',
        params.url,
        '--out',
        params.outDir,
        // Python tự dừng sớm hơn Node một nhịp để nó kịp in JSON lỗi tử tế,
        // thay vì bị Node giết ngang rồi không biết hỏng ở đâu.
        '--timeout',
        String(Math.max(1, Math.floor((timeoutMs / 1000) * 0.9))),
        '--json',
      ],
      timeoutMs,
    );

    const { filePath, fileSize, mimeType } = body;
    if (typeof filePath !== 'string' || typeof fileSize !== 'number') {
      throw new DownloaderParseError(JSON.stringify(body));
    }
    return {
      filePath,
      fileSize,
      mimeType: typeof mimeType === 'string' ? mimeType : 'video/mp4',
    };
  }

  /** KHÔNG ném lỗi trong bất kỳ nhánh nào — "chưa cài" là câu trả lời hợp lệ. */
  async checkAvailability(): Promise<DownloaderAvailability> {
    try {
      const body = await this.runJson(
        ['contract-version', '--json'],
        AVAILABILITY_TIMEOUT_MS,
      );
      const version = (body as { version?: unknown }).version;
      return {
        available: true,
        version: typeof version === 'string' ? version : undefined,
      };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : 'Lỗi không xác định',
      };
    }
  }

  /**
   * Chạy một lệnh Python và trả về payload JSON đã kiểm hợp đồng.
   *
   * Thứ tự kiểm cố ý: **hợp đồng trước, `ok` sau**. Version lệch thì mọi field
   * bên trong đều không đáng tin, kể cả `errorCode` (§3.3c).
   */
  private async runJson(
    args: string[],
    timeoutMs: number,
    extraEnv: Record<string, string> = {},
  ): Promise<Record<string, unknown>> {
    const { pythonBin, projectDir } = await this.resolveRunnable();

    const result = await this.spawnProcess(
      pythonBin,
      ['-m', 'backend', ...args],
      projectDir,
      timeoutMs,
      extraEnv,
    );

    if (result.timedOut) throw new DownloaderTimeoutError(timeoutMs);

    // stderr là log người đọc — hữu ích khi debug, nhưng không bao giờ là dữ liệu.
    if (result.stderr.trim() !== '') {
      this.logger.debug(`[downloader] ${result.stderr.trim()}`);
    }

    const body = parseJsonLine(result.stdout);

    const version = body.contractVersion;
    if (version !== REUP_CONTRACT_VERSION) {
      throw new DownloaderContractMismatchError(REUP_CONTRACT_VERSION, version);
    }

    if (body.ok !== true) {
      const code =
        typeof body.errorCode === 'string' ? body.errorCode : 'UNKNOWN';
      const message =
        typeof body.message === 'string' ? body.message : 'Lỗi không xác định';
      throw toDomainError(code, message);
    }

    if (result.exitCode !== 0) {
      // `ok: true` mà exit != 0 là mâu thuẫn ⇒ coi như hỏng, không tin payload.
      throw new DownloadFailedError(
        `Downloader trả ok nhưng thoát với mã ${String(result.exitCode)}`,
      );
    }

    return body as Record<string, unknown>;
  }

  /**
   * Kiểm downloader có dùng được không — chạy **mỗi lần gọi**, không cache và
   * **không** kiểm lúc boot (QĐ-6). Người dùng cài downloader xong phải chạy
   * được **ngay**, không cần restart backend (nghiệm thu plan 28 §5).
   */
  private async resolveRunnable(): Promise<{
    pythonBin: string;
    projectDir: string;
  }> {
    const { pythonBin, projectDir } = this.config.reup;

    if (pythonBin === undefined || projectDir === undefined) {
      throw new DownloaderUnavailableError(
        'chưa cấu hình REUP_PYTHON_BIN / REUP_PROJECT_DIR',
      );
    }

    try {
      await access(pythonBin, constants.X_OK);
    } catch {
      throw new DownloaderUnavailableError(
        `không chạy được ${pythonBin} (không tồn tại hoặc thiếu quyền thực thi)`,
      );
    }

    try {
      await access(projectDir, constants.R_OK);
    } catch {
      throw new DownloaderUnavailableError(
        `không đọc được thư mục ${projectDir}`,
      );
    }

    return { pythonBin, projectDir };
  }

  private spawnProcess(
    command: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
    extraEnv: Record<string, string>,
  ): Promise<SpawnResult> {
    return new Promise<SpawnResult>((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = spawn(command, args, {
          cwd,
          // `detached` để process con thành trưởng nhóm ⇒ giết được **cả cây**
          // bằng `kill(-pid)`. yt-dlp là process CHÁU: giết mỗi process con thì
          // yt-dlp thành mồ côi, tiếp tục ăn CPU và ghi đĩa (plan 28 §6 R2).
          detached: true,
          env: { ...process.env, ...extraEnv },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        reject(
          new DownloaderUnavailableError(
            `spawn thất bại: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
        return;
      }

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;

      const timer = setTimeout(() => {
        timedOut = true;
        killTree(child);
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (error: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // ENOENT = không có file/binary đó ⇒ "chưa cài", KHÔNG phải lỗi 500 chung.
        reject(
          error.code === 'ENOENT'
            ? new DownloaderUnavailableError(
                `không tìm thấy chương trình ${command}`,
              )
            : new DownloadFailedError(error.message),
        );
      });

      child.on('close', (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode, timedOut });
      });
    });
  }

  /** Chưa cấu hình key ⇒ ném NGAY, không spawn process nào (plan 28 §4 test). */
  private async getYoutubeApiKeyOrFail(): Promise<string> {
    const apiKey = await this.settings.getYoutubeApiKey();
    if (apiKey === null || apiKey.trim() === '') {
      throw new YoutubeNotConfiguredError();
    }
    return apiKey;
  }
}

/** Giết **cả nhóm process** (yt-dlp là cháu, không phải con trực tiếp). */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  try {
    // Dấu trừ = gửi tín hiệu cho cả process group (nhờ `detached: true`).
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // Nhóm đã chết trước đó — thử giết riêng process con cho chắc.
    try {
      child.kill('SIGKILL');
    } catch {
      // Không còn gì để giết.
    }
  }
}

/**
 * Lấy **dòng JSON** trong stdout.
 *
 * Hợp đồng nói stdout chỉ có đúng 1 dòng JSON, nhưng đây là biên với process
 * ngoài — không tin tuyệt đối. Quét từ dòng cuối lên (JSON luôn in sau cùng) và
 * bỏ qua dòng rác; rác đứng TRƯỚC JSON thì vẫn đọc được thay vì nổ (cạm bẫy C4).
 * Không tìm thấy dòng JSON nào ⇒ `ParseError` có kèm stdout để còn debug.
 */
function parseJsonLine(stdout: string): ContractEnvelope {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith('{')) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    } catch {
      // Dòng này không phải JSON hợp lệ — thử dòng trước đó.
    }
  }

  throw new DownloaderParseError(stdout);
}

function toCandidate(raw: unknown): ReupVideoCandidate {
  const video = (raw ?? {}) as Record<string, unknown>;
  return {
    externalId: asString(video.externalId),
    title: asString(video.title),
    authorName: asString(video.authorName),
    sourceUrl: asString(video.sourceUrl),
    publishedAt: asNullableString(video.publishedAt),
    // `null` = không đo được, KHÔNG quy về 0 (xem chú thích ở interface).
    durationSec: asNullableNumber(video.durationSec),
    viewCount: asNullableNumber(video.viewCount),
    thumbnailUrl: asNullableString(video.thumbnailUrl),
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
