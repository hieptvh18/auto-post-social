import { parseDriveLink, titleFromFilename } from '../drive-link.util';

const FILE_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz01234';
const FOLDER_ID = '1ZzYyXxWwVvUuTtSsRrQqPpOoNnMmLl';

describe('parseDriveLink', () => {
  describe('link file', () => {
    it.each([
      [
        'dạng /file/d/<id>/view',
        `https://drive.google.com/file/d/${FILE_ID}/view`,
      ],
      [
        'kèm tham số usp',
        `https://drive.google.com/file/d/${FILE_ID}/view?usp=sharing&ts=1`,
      ],
      [
        'có tiền tố /u/0 khi đăng nhập nhiều tài khoản',
        `https://drive.google.com/drive/u/0/file/d/${FILE_ID}/view`,
      ],
      ['dạng open?id=', `https://drive.google.com/open?id=${FILE_ID}`],
      [
        'dạng uc?export=download&id=',
        `https://drive.google.com/uc?export=download&id=${FILE_ID}`,
      ],
      [
        'host usercontent',
        `https://drive.usercontent.google.com/download?id=${FILE_ID}&export=download`,
      ],
      [
        'link Google Docs (loại file sẽ bị chặn ở bước sau, không phải ở đây)',
        `https://docs.google.com/document/d/${FILE_ID}/edit`,
      ],
      [
        'có khoảng trắng thừa hai đầu',
        `   https://drive.google.com/file/d/${FILE_ID}/view  `,
      ],
    ])('nhận %s', (_label, link) => {
      expect(parseDriveLink(link)).toEqual({ kind: 'file', id: FILE_ID });
    });

    it('nhận cả khi người dùng dán thẳng fileId', () => {
      expect(parseDriveLink(FILE_ID)).toEqual({ kind: 'file', id: FILE_ID });
    });
  });

  describe('link thư mục', () => {
    it('trả kind folder để tầng trên báo đúng câu "hãy dán link từng file"', () => {
      expect(
        parseDriveLink(`https://drive.google.com/drive/folders/${FOLDER_ID}`),
      ).toEqual({ kind: 'folder', id: FOLDER_ID });
    });

    it('nhận dạng folder kể cả khi có /u/1 và tham số', () => {
      expect(
        parseDriveLink(
          `https://drive.google.com/drive/u/1/folders/${FOLDER_ID}?usp=drive_link`,
        ),
      ).toEqual({ kind: 'folder', id: FOLDER_ID });
    });
  });

  describe('không nhận ra', () => {
    it.each([
      ['chuỗi rỗng', ''],
      ['chỉ khoảng trắng', '    '],
      ['câu chữ bất kỳ', 'file quay ở buổi khai trương'],
      ['id quá ngắn để coi là fileId dán thẳng', 'abc123'],
      [
        'link không phải Google (cùng dạng /d/<id>)',
        `https://www.dropbox.com/file/d/${FILE_ID}/view`,
      ],
      ['link Google nhưng không có id', 'https://drive.google.com/my-drive'],
    ])('trả null với %s', (_label, link) => {
      expect(parseDriveLink(link)).toBeNull();
    });
  });
});

describe('titleFromFilename', () => {
  it('bỏ đuôi mở rộng', () => {
    expect(titleFromFilename('clip-khai-truong.mp4')).toBe('clip-khai-truong');
  });

  it('giữ dấu chấm trong tên khi đó không phải đuôi mở rộng', () => {
    expect(titleFromFilename('bai 1. gioi thieu')).toBe('bai 1. gioi thieu');
  });

  it('gộp khoảng trắng thừa', () => {
    expect(titleFromFilename('  anh   nen  .png')).toBe('anh nen');
  });

  it('không trả về chuỗi rỗng khi tên file chỉ có đuôi', () => {
    expect(titleFromFilename('.gitignore')).toBe('.gitignore');
  });
});
