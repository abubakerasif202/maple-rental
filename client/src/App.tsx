import { useMemo } from 'react';
import { Box, CssBaseline, ThemeProvider } from '@mui/material';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppFrame } from '@/components/AppFrame';
import { createAppTheme } from '@/theme';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ApplyPage } from '@/pages/ApplyPage';
import { VehiclesPage } from '@/pages/VehiclesPage';
import { BillingPage } from '@/pages/BillingPage';
import { AdminPage } from '@/pages/AdminPage';
import { useUiStore } from '@/store/uiStore';

export default function App() {
  const location = useLocation();
  const themeMode = useUiStore((state) => state.themeMode);
  const theme = useMemo(() => createAppTheme(themeMode), [themeMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppFrame>
        <Box key={location.pathname} sx={{ animation: 'routeSwap 360ms ease both' }}>
          <Routes location={location}>
            <Route path="/" element={<Navigate to="/vehicles" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/apply" element={<ApplyPage />} />
            <Route path="/vehicles" element={<VehiclesPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </Box>
      </AppFrame>
    </ThemeProvider>
  );
}
