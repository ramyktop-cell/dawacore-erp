export const getDbProvider = (): 'postgresql' | 'sqlite' => {
  const url = process.env.DATABASE_URL || '';
  return url.startsWith('postgresql') || url.startsWith('postgres')
    ? 'postgresql'
    : 'sqlite';
};

export const supportsPessimisticLocking = (): boolean => {
  return getDbProvider() === 'postgresql';
};

export const skipIfNoPessimisticLocking = () => {
  if (!supportsPessimisticLocking()) {
    console.warn(
      '⚠️ تم تخطي اختبار التزامن - يتطلب PostgreSQL (FOR UPDATE)',
    );
    return true;
  }
  return false;
};
