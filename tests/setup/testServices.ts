import { createTestDatabase } from './testDb'

// Create isolated test environment with real services
export function createTestEnvironment() {
  const testDb = createTestDatabase()
  
  // Replace the real db with test db
  Object.setPrototypeOf(require('@/db/sqlite'), { 
    db: testDb,
    closeDatabase: () => testDb.close()
  })
  
  return {
    db: testDb,
    cleanup: () => {
      testDb.close()
      // Restore original if needed
    }
  }
}