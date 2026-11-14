module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  roots: ['<rootDir>', '<rootDir>/../test'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.module.ts',
    '!**/*.dto.ts',
    '!**/node_modules/**',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/../test/setup.ts'],
  testTimeout: 30000,
  setupFiles: ['<rootDir>/../test/dotenv-setup.ts'],

  // ✅ جديد: ترجمة المسارات المطلقة (src/* → rootDir/*)
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/$1',
    '^puppeteer$': '<rootDir>/../test/mocks/puppeteer.mock',
  },
};
