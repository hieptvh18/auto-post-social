import type {
  CreateUserBody,
  PaginatedUsers,
  QueryUsersParams,
  UpdateUserBody,
  UserResponse,
} from '../types';
import { apiRequest } from './client';

function toQueryString(params: QueryUsersParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const usersApi = {
  /** GET /users — chỉ ADMIN (`users:manage`). */
  list(params: QueryUsersParams = {}): Promise<PaginatedUsers> {
    return apiRequest<PaginatedUsers>(`/users${toQueryString(params)}`);
  },

  getById(id: string): Promise<UserResponse> {
    return apiRequest<UserResponse>(`/users/${id}`);
  },

  create(body: CreateUserBody): Promise<UserResponse> {
    return apiRequest<UserResponse>('/users', { method: 'POST', body });
  },

  update(id: string, body: UpdateUserBody): Promise<UserResponse> {
    return apiRequest<UserResponse>(`/users/${id}`, { method: 'PUT', body });
  },

  /** DELETE /users/:id — soft delete: backend set `isActive = false`. */
  remove(id: string): Promise<UserResponse> {
    return apiRequest<UserResponse>(`/users/${id}`, { method: 'DELETE' });
  },
};
