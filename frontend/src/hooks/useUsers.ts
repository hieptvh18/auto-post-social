import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { usersApi } from '../api/users.api';
import type {
  CreateUserBody,
  PaginatedUsers,
  QueryUsersParams,
  UpdateUserBody,
} from '../types';

const USERS_KEY = 'users';

export function useUsers(
  params: QueryUsersParams = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<PaginatedUsers> {
  return useQuery({
    queryKey: [USERS_KEY, params],
    queryFn: () => usersApi.list(params),
    enabled: options.enabled ?? true,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserBody) => usersApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [USERS_KEY] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserBody }) =>
      usersApi.update(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [USERS_KEY] });
    },
  });
}

/** Vô hiệu hóa user (soft delete) — backend giữ dòng vì content/audit còn tham chiếu. */
export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [USERS_KEY] });
    },
  });
}
