import { Alert, Modal, Table, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../api/client';
import { useImportPages, usePageCandidates } from '../../hooks/usePages';
import type { FacebookPageCandidate } from '../../types';

const { Text } = Typography;

interface Props {
  /** null = modal đóng. Mở bằng cách truyền id kết nối vừa đăng nhập xong. */
  connectionId: string | null;
  onClose: () => void;
}

/**
 * Chọn page để đưa vào hệ thống sau khi đăng nhập Facebook (plan 15 §3.7).
 *
 * Hai luật hiển thị quan trọng:
 * 1. Page không có quyền tạo nội dung ⇒ khoá dòng lại kèm lý do — chặn ngay ở đây
 *    thay vì để user phát hiện lúc bot chạy.
 * 2. Page đang dùng token dán tay ⇒ bỏ tick sẵn, phải xác nhận mới ghi đè.
 */
export function ConnectPagesModal({ connectionId, onClose }: Props) {
  const { data: candidates, isLoading } = usePageCandidates(connectionId);
  const importMutation = useImportPages();
  const [selected, setSelected] = useState<string[]>([]);

  // Mặc định tick sẵn page nhập được và chưa có trong hệ thống — việc user hay làm nhất.
  useEffect(() => {
    if (candidates === undefined) return;
    setSelected(
      candidates
        .filter((page) => page.importable && !page.alreadyAdded)
        .map((page) => page.pageId),
    );
  }, [candidates]);

  const manualSelected = useMemo(
    () =>
      (candidates ?? []).filter(
        (page) =>
          selected.includes(page.pageId) &&
          page.currentConnectMode === 'MANUAL_TOKEN',
      ),
    [candidates, selected],
  );

  const runImport = async (overwriteManual: boolean): Promise<void> => {
    if (connectionId === null) return;
    try {
      const result = await importMutation.mutateAsync({
        connectionId,
        body: { pageIds: selected, overwriteManual },
      });

      if (result.needsConfirm.length > 0) {
        Modal.confirm({
          title: 'Thay token dán tay bằng token đăng nhập?',
          content: (
            <>
              <div>
                {result.needsConfirm.map((p) => p.pageName).join(', ')} đang chạy
                bằng token nhập tay.
              </div>
              <Text type="secondary">
                Token dán tay thường là token System User do doanh nghiệp cấp và
                bền hơn. Chỉ thay khi token đó đã hỏng.
              </Text>
            </>
          ),
          okText: 'Thay token',
          cancelText: 'Giữ nguyên',
          onOk: () => void runImport(true),
        });
        return;
      }

      if (result.imported.length > 0) {
        message.success(`Đã nhập ${result.imported.length} page`);
      }
      result.skipped.forEach((item) => {
        message.warning(`${item.pageId}: ${item.reason}`);
      });
      if (result.imported.length > 0) onClose();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Nhập page thất bại');
    }
  };

  const columns: ColumnsType<FacebookPageCandidate> = [
    {
      title: 'Page',
      dataIndex: 'pageName',
      render: (name: string | null, record) => (
        <>
          <div>{name ?? '(không tên)'}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.pageId}
            {record.category ? ` · ${record.category}` : ''}
          </Text>
        </>
      ),
    },
    {
      title: 'Đăng bài được?',
      dataIndex: 'canPost',
      width: 150,
      render: (canPost: boolean, record) =>
        canPost ? (
          <Tag color="success">Có</Tag>
        ) : (
          <Tooltip title={record.blockedReason}>
            <Tag color="error">Không</Tag>
          </Tooltip>
        ),
    },
    {
      title: 'Trong hệ thống',
      width: 220,
      render: (_, record) => {
        if (!record.importable) {
          return <Text type="secondary">{record.blockedReason}</Text>;
        }
        if (!record.alreadyAdded) return <Text type="secondary">Chưa có</Text>;
        return record.currentConnectMode === 'MANUAL_TOKEN' ? (
          <>
            <Tag color="warning">Đang dùng token dán tay</Tag>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Tick để thay bằng token đăng nhập — sẽ hỏi xác nhận.
              </Text>
            </div>
          </>
        ) : (
          <Tag color="blue">Đã kết nối · sẽ lấy token mới</Tag>
        );
      },
    },
  ];

  return (
    <Modal
      title="Chọn Page để đưa vào hệ thống"
      open={connectionId !== null}
      onCancel={onClose}
      width={820}
      okText={`Nhập ${selected.length} page`}
      cancelText="Để sau"
      okButtonProps={{
        disabled: selected.length === 0,
        loading: importMutation.isPending,
      }}
      onOk={() => void runImport(false)}
    >
      <Alert
        type="success"
        showIcon
        style={{ marginBottom: 16 }}
        message="Đã kết nối tài khoản Facebook"
        description="Chọn page muốn để bot đăng bài — có thể quay lại thêm sau."
      />

      {manualSelected.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Có page đang dùng token dán tay"
          description="Hệ thống sẽ hỏi xác nhận trước khi thay token của những page đó."
        />
      )}

      <Table
        rowKey="pageId"
        size="small"
        loading={isLoading}
        columns={columns}
        dataSource={candidates ?? []}
        pagination={false}
        scroll={{ x: 700 }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys as string[]),
          getCheckboxProps: (record) => ({ disabled: !record.importable }),
        }}
      />
    </Modal>
  );
}
