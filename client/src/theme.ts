import { alpha, createTheme } from '@mui/material/styles';
import type { ThemeMode } from '@/store/uiStore';

export const createAppTheme = (mode: ThemeMode) => {
  const isDark = mode === 'dark';

  const ink = isDark ? '#090d14' : '#f3efe8';
  const shell = isDark ? '#0d1420' : '#fffaf2';
  const panel = isDark ? '#121b28' : '#fff8ef';
  const panelRaised = isDark ? '#162131' : '#ffffff';
  const brass = '#c6a76a';
  const frost = isDark ? '#f6f0e3' : '#16202c';
  const muted = isDark ? '#94a3b8' : '#617084';
  const secondary = '#8fb7ff';

  return createTheme({
    palette: {
      mode,
      primary: {
        main: brass,
        light: '#e0c48f',
        dark: '#8e6f3e',
        contrastText: '#111111',
      },
      secondary: {
        main: secondary,
      },
      background: {
        default: ink,
        paper: panel,
      },
      text: {
        primary: frost,
        secondary: muted,
      },
      success: {
        main: '#4dd4a5',
      },
      warning: {
        main: '#f6b56b',
      },
      error: {
        main: '#ff7a7a',
      },
      divider: alpha(isDark ? '#ffffff' : '#16202c', isDark ? 0.08 : 0.08),
    },
    typography: {
      fontFamily: '"Sora", "Inter", "Segoe UI", sans-serif',
      h1: {
        fontWeight: 700,
        letterSpacing: '-0.05em',
        fontSize: 'clamp(2.8rem, 6vw, 5rem)',
        lineHeight: 0.96,
      },
      h2: {
        fontWeight: 700,
        letterSpacing: '-0.045em',
        fontSize: 'clamp(2rem, 4vw, 3.35rem)',
        lineHeight: 1,
      },
      h3: {
        fontWeight: 700,
        letterSpacing: '-0.035em',
      },
      h4: {
        fontWeight: 650,
        letterSpacing: '-0.03em',
      },
      h5: {
        fontWeight: 650,
        letterSpacing: '-0.025em',
      },
      h6: {
        fontWeight: 650,
        letterSpacing: '-0.02em',
      },
      subtitle1: {
        fontWeight: 600,
      },
      body1: {
        lineHeight: 1.7,
      },
      body2: {
        lineHeight: 1.65,
      },
      overline: {
        fontSize: '0.72rem',
        letterSpacing: '0.18em',
        fontWeight: 700,
        textTransform: 'uppercase',
        color: alpha(frost, 0.66),
      },
      button: {
        textTransform: 'none',
        fontWeight: 650,
        letterSpacing: '-0.01em',
      },
    },
    shape: {
      borderRadius: 24,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            colorScheme: mode,
          },
          '@keyframes riseIn': {
            from: {
              opacity: 0,
              transform: 'translateY(16px)',
            },
            to: {
              opacity: 1,
              transform: 'translateY(0)',
            },
          },
          '@keyframes routeSwap': {
            from: {
              opacity: 0,
              transform: 'translateY(18px) scale(0.99)',
            },
            to: {
              opacity: 1,
              transform: 'translateY(0) scale(1)',
            },
          },
          body: {
            margin: 0,
            background: isDark
              ? [
                  `radial-gradient(circle at 12% 18%, ${alpha(brass, 0.16)}, transparent 24%)`,
                  `radial-gradient(circle at 90% 10%, ${alpha(secondary, 0.14)}, transparent 20%)`,
                  'linear-gradient(180deg, #060910 0%, #0a1019 40%, #060910 100%)',
                ].join(',')
              : [
                  `radial-gradient(circle at 15% 16%, ${alpha(brass, 0.18)}, transparent 25%)`,
                  `radial-gradient(circle at 90% 10%, ${alpha(secondary, 0.12)}, transparent 22%)`,
                  'linear-gradient(180deg, #f7f2e8 0%, #efe7d8 48%, #f5efe4 100%)',
                ].join(','),
            backgroundAttachment: 'fixed',
          },
          '#root': {
            minHeight: '100vh',
          },
          '*': {
            boxSizing: 'border-box',
          },
          '::selection': {
            backgroundColor: alpha(brass, 0.32),
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: `linear-gradient(180deg, ${alpha(panelRaised, isDark ? 0.96 : 0.98)} 0%, ${alpha(shell, isDark ? 0.96 : 0.98)} 100%)`,
            border: `1px solid ${alpha(isDark ? '#ffffff' : '#16202c', isDark ? 0.08 : 0.08)}`,
            boxShadow: isDark
              ? `0 18px 50px ${alpha('#000000', 0.32)}`
              : `0 16px 40px ${alpha('#4a3e2e', 0.12)}`,
            backdropFilter: 'blur(18px)',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            minHeight: 44,
            borderRadius: 999,
            paddingInline: 18,
          },
          contained: {
            boxShadow: `0 14px 32px ${alpha(brass, 0.24)}`,
            background: `linear-gradient(135deg, ${brass} 0%, #e0c48f 100%)`,
          },
          outlined: {
            borderColor: alpha(isDark ? '#ffffff' : '#16202c', 0.14),
            backgroundColor: alpha(isDark ? '#ffffff' : '#16202c', 0.02),
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            border: `1px solid ${alpha(isDark ? '#ffffff' : '#16202c', 0.08)}`,
            backgroundColor: alpha(isDark ? '#ffffff' : '#16202c', 0.04),
            fontWeight: 600,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 18,
            backgroundColor: alpha(isDark ? '#ffffff' : '#16202c', 0.03),
            transition: 'border-color 180ms ease, transform 180ms ease',
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(brass, 0.35),
            },
            '&.Mui-focused': {
              transform: 'translateY(-1px)',
            },
          },
          notchedOutline: {
            borderColor: alpha(isDark ? '#ffffff' : '#16202c', 0.08),
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            boxShadow: 'none',
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: alpha(isDark ? '#ffffff' : '#16202c', 0.08),
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: alpha(isDark ? '#ffffff' : '#16202c', 0.06),
          },
          head: {
            color: alpha(frost, 0.72),
            fontSize: '0.74rem',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            fontWeight: 700,
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: 'background-color 180ms ease',
            '&:hover': {
              backgroundColor: alpha(isDark ? '#ffffff' : '#16202c', 0.025),
            },
          },
        },
      },
    },
  });
};
