import { introductionChannelService } from "@/core/services/introductionChannelService";

export interface ConfigureChannelInput {
	guildId: string;
	channelId: string;
	configuredBy: string;
}

export interface ConfigureChannelResult {
	success: boolean;
	error?: string;
	previousChannelId?: string;
	newChannelId?: string;
}

export async function configureIntroductionChannel(input: ConfigureChannelInput): Promise<ConfigureChannelResult> {
	try {
		// Check if there's already a configured channel
		const existingConfig = introductionChannelService.getChannelConfig(input.guildId);
		const previousChannelId = existingConfig?.channelId;

		// Set the new channel configuration
		introductionChannelService.setChannelConfig(input.guildId, input.channelId, input.configuredBy);

		return {
			success: true,
			previousChannelId,
			newChannelId: input.channelId,
		};
	} catch (error) {
		console.error("Error configuring introduction channel:", error);
		return {
			success: false,
			error: "Failed to configure introduction channel",
		};
	}
}

export interface RemoveChannelInput {
	guildId: string;
}

export interface RemoveChannelResult {
	success: boolean;
	error?: string;
	wasConfigured: boolean;
	removedChannelId?: string;
}

export async function removeIntroductionChannel(input: RemoveChannelInput): Promise<RemoveChannelResult> {
	try {
		// Get current config before removing
		const existingConfig = introductionChannelService.getChannelConfig(input.guildId);

		if (!existingConfig) {
			return {
				success: true,
				wasConfigured: false,
			};
		}

		// Remove the configuration
		const removed = introductionChannelService.removeChannelConfig(input.guildId);

		return {
			success: true,
			wasConfigured: true,
			removedChannelId: existingConfig.channelId,
		};
	} catch (error) {
		console.error("Error removing introduction channel:", error);
		return {
			success: false,
			error: "Failed to remove introduction channel configuration",
			wasConfigured: false,
		};
	}
}