import { createSlice } from '@reduxjs/toolkit';
import type { Notification } from './types';

interface UiState {
  sidebarOpen: boolean;
  activeModal: string | null;
  notifications: Notification[];
}

const initialState: UiState = {
  sidebarOpen: true,
  activeModal: null,
  notifications: [
    {
      id: '1',
      title: 'Integration attention needed',
      message: 'Google Calendar sync failed 2 times in the last hour.',
      type: 'warning',
      read: false,
      createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
    {
      id: '2',
      title: 'Usage milestone',
      message: 'You reached 80% of your included call minutes.',
      type: 'info',
      read: false,
      createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
    {
      id: '3',
      title: 'Booking trend up',
      message: 'Call-to-booking conversion increased by 6% this week.',
      type: 'success',
      read: true,
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    },
  ],
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setSidebarOpen: (state, action: { payload: boolean }) => {
      state.sidebarOpen = action.payload;
    },
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setActiveModal: (state, action: { payload: string | null }) => {
      state.activeModal = action.payload;
    },
    addNotification: (
      state,
      action: { payload: Omit<Notification, 'id' | 'read' | 'createdAt'> }
    ) => {
      state.notifications.unshift({
        ...action.payload,
        id: crypto.randomUUID(),
        read: false,
        createdAt: new Date().toISOString(),
      });
    },
    markNotificationRead: (state, action: { payload: string }) => {
      const n = state.notifications.find((x) => x.id === action.payload);
      if (n) n.read = true;
    },
    markAllNotificationsRead: (state) => {
      state.notifications = state.notifications.map((notification) => ({
        ...notification,
        read: true,
      }));
    },
  },
});

export const {
  setSidebarOpen,
  toggleSidebar,
  setActiveModal,
  addNotification,
  markNotificationRead,
  markAllNotificationsRead,
} = uiSlice.actions;
export default uiSlice.reducer;
