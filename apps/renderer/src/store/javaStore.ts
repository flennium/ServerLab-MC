import { create } from "zustand";
import { api } from "../lib/apiClient.js";
import type { JavaVersion, JavaListResponse } from "@serverlab/shared";

interface JavaStore {
  versions: JavaVersion[];
  loading: boolean;
  fetchVersions: () => Promise<void>;
  detectVersions: () => Promise<void>;
}

export const useJavaStore = create<JavaStore>((set) => ({
  versions: [],
  loading: false,

  fetchVersions: async () => {
    set({ loading: true });
    try {
      const { versions } = await api.get<JavaListResponse>("/api/java");
      set({ versions });
    } finally {
      set({ loading: false });
    }
  },

  detectVersions: async () => {
    set({ loading: true });
    try {
      const { versions } = await api.post<JavaListResponse>("/api/java/detect");
      set({ versions });
    } finally {
      set({ loading: false });
    }
  },
}));
