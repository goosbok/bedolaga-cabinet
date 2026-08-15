import apiClient, { isNotFound } from './client';

export type InfoPageType = 'page' | 'faq';

export type ReplacesTab = 'faq' | 'rules' | 'privacy' | 'offer';

export type InfoPageDisplayMode = 'bot' | 'web' | 'both';

export interface InfoPage {
  id: number;
  slug: string;
  title: Record<string, string>;
  content: Record<string, string>;
  page_type: InfoPageType;
  is_active: boolean;
  sort_order: number;
  icon: string | null;
  replaces_tab: ReplacesTab | null;
  display_mode: InfoPageDisplayMode;
  created_at: string;
  updated_at: string | null;
}

export interface InfoPageListItem {
  id: number;
  slug: string;
  title: Record<string, string>;
  page_type: InfoPageType;
  is_active: boolean;
  sort_order: number;
  icon: string | null;
  replaces_tab: ReplacesTab | null;
  display_mode: InfoPageDisplayMode;
  updated_at: string | null;
}

export interface InfoPageCreateRequest {
  slug: string;
  title: Record<string, string>;
  content: Record<string, string>;
  page_type: InfoPageType;
  is_active: boolean;
  sort_order: number;
  icon: string | null;
  replaces_tab: ReplacesTab | null;
  display_mode: InfoPageDisplayMode;
}

export interface InfoPageUpdateRequest {
  slug?: string;
  title?: Record<string, string>;
  content?: Record<string, string>;
  page_type?: InfoPageType;
  is_active?: boolean;
  sort_order?: number;
  icon?: string | null;
  replaces_tab?: ReplacesTab | null;
  display_mode?: InfoPageDisplayMode;
}

export type TabReplacements = Record<ReplacesTab, string | null>;

/** Single FAQ Q&A item stored in content JSONB. */
export interface FaqItem {
  q: string;
  a: string;
}

export interface InfoPageReorderRequest {
  items: Array<{ id: number; sort_order: number }>;
}

export const infoPagesApi = {
  // Public endpoints
  // Bots older than the custom-InfoPages feature return 404 here. That is not an
  // error condition — it means "no custom pages", and the Info tabs gate their
  // content queries on this one resolving, so letting it reject stalls the whole
  // page for the retry window on every visit.
  getTabReplacements: async (): Promise<TabReplacements> => {
    try {
      const response = await apiClient.get<TabReplacements>('/cabinet/info-pages/tab-replacements');
      return response.data;
    } catch (error) {
      if (isNotFound(error)) return { faq: null, rules: null, privacy: null, offer: null };
      throw error;
    }
  },

  getPages: async (pageType?: InfoPageType): Promise<InfoPageListItem[]> => {
    const params = pageType ? { page_type: pageType } : undefined;
    try {
      const response = await apiClient.get<InfoPageListItem[]>('/cabinet/info-pages', { params });
      return response.data;
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  },

  getPageBySlug: async (slug: string): Promise<InfoPage> => {
    const response = await apiClient.get<InfoPage>(
      `/cabinet/info-pages/${encodeURIComponent(slug)}`,
    );
    return response.data;
  },

  // Admin endpoints
  getAdminPages: async (pageType?: InfoPageType): Promise<InfoPageListItem[]> => {
    const params = pageType ? { page_type: pageType } : undefined;
    const response = await apiClient.get<InfoPageListItem[]>('/cabinet/admin/info-pages', {
      params,
    });
    return response.data;
  },

  getAdminPage: async (id: number): Promise<InfoPage> => {
    const response = await apiClient.get<InfoPage>(`/cabinet/admin/info-pages/${id}`);
    return response.data;
  },

  createPage: async (data: InfoPageCreateRequest): Promise<InfoPage> => {
    const response = await apiClient.post<InfoPage>('/cabinet/admin/info-pages', data);
    return response.data;
  },

  updatePage: async (id: number, data: InfoPageUpdateRequest): Promise<InfoPage> => {
    const response = await apiClient.put<InfoPage>(`/cabinet/admin/info-pages/${id}`, data);
    return response.data;
  },

  deletePage: async (id: number): Promise<void> => {
    await apiClient.delete(`/cabinet/admin/info-pages/${id}`);
  },

  toggleActive: async (id: number): Promise<InfoPage> => {
    const response = await apiClient.post<InfoPage>(
      `/cabinet/admin/info-pages/${id}/toggle-active`,
    );
    return response.data;
  },

  reorder: async (data: InfoPageReorderRequest): Promise<void> => {
    await apiClient.post('/cabinet/admin/info-pages/reorder', data);
  },
};
