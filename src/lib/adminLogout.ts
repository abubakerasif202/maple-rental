interface AdminLogoutDependencies {
  clearClientState: () => void;
  logout: () => Promise<unknown>;
  redirectToLogin: () => void;
}

export const completeAdminLogout = async ({
  clearClientState,
  logout,
  redirectToLogin,
}: AdminLogoutDependencies) => {
  await logout();
  clearClientState();
  redirectToLogin();
};
