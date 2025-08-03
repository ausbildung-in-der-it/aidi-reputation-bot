import { UserInfo } from '@/core/types/UserInfo'

export function createTestUser(id: string, options: {
  isBot?: boolean;
  username?: string;
  displayName?: string;
} = {}): UserInfo {
  return {
    id,
    isBot: options.isBot ?? false,
    username: options.username ?? `user_${id}`,
    displayName: options.displayName ?? `User ${id}`
  }
}

export function createTestBot(id: string, username = `bot_${id}`): UserInfo {
  return createTestUser(id, { isBot: true, username, displayName: username })
}

export function generateGuildId(): string {
  return `guild_${Math.random().toString(36).substr(2, 9)}`
}

export function generateMessageId(): string {
  return `msg_${Math.random().toString(36).substr(2, 9)}`
}

export function generateUserId(): string {
  return `user_${Math.random().toString(36).substr(2, 9)}`
}