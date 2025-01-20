import { ObjectId } from "mongodb";
import type { ClientExtended } from "./classes.ts";
import { getData, listData, setData } from "./mongohelper.ts"; // Import mongoHelpers functions
import {
	type Channel,
	EmbedBuilder,
	Guild,
	MessageFlags,
	User,
} from "discord.js";
import { getNestedKey, type UserConfig } from "./config.ts";

interface UserLeveling {
	userid: string;
	experience: number;
	level: number;
	serverid: string;
	_id: ObjectId;
}

// Function to calculate experience gain
export function calculateExpGain(multiplier: number = 1): number {
	const randomChance = Math.random() * 100; // Get a random number from 0 to 99.99

	// If the random chance is less than or equal to 2, calculate a random amount around 15
	if (randomChance <= 2) {
		// Add a small random variation between -5 and +5
		const variation = Math.floor(Math.random() * 11 * multiplier) - 5; // Random number between -5 and 5
		const expGain = 15 + variation; // Calculate XP gain

		// Ensure the value does not fall below 1
		return Math.max(expGain, 1);
	} else {
		// Otherwise, generate a random number between 1 and 3
		return Math.floor(Math.random() * 3 * multiplier) + 1; // Returns 1, 2, or 3
	}
}

// Function to calculate experience required to reach the next level based on a quadratic equation
export function calculateExpToNextLevel(
	currentLevel: number,
	currentExperience: number = 0
): number {
	// Coefficients for the quadratic function
	const a = 2;
	const b = 50;
	const c = 100;

	// Quadratic formula to calculate experience needed
	const expNeeded = a * Math.pow(currentLevel + 1, 2) + b * currentLevel + c;

	return Math.floor(expNeeded / 10) - currentExperience; // Return the experience needed for the next level
}

// Updated function to get member experience using mongoHelper
export async function getMemberExperience(
	client: ClientExtended,
	memberId: string,
	serverId: string
) {
	const users = await getData(client, "leveling", {
		userid: memberId,
		serverid: serverId,
	});
	return users.length > 0 ? users[0].experience : 0; // Return user experience or 0 if not found
}

export async function getMemberLevel(
	client: ClientExtended,
	memberId: string,
	serverId: string
) {
	const users = await getData(client, "leveling", {
		userid: memberId,
		serverid: serverId,
	});
	return users.length > 0 ? users[0].level : 0; // Return user experience or 0 if not found
}

// Updated function to update member experience using mongoHelper
export async function updateMemberStats(
	client: ClientExtended,
	memberId: string,
	serverId: string,
	newExperience: number,
	newLevel: number
) {
	// Step 1: Fetch existing user data
	const users = (await getData(client, "leveling", {
		userid: memberId,
		serverid: serverId,
	})) as UserLeveling[];

	if (users[0]) {
		const userobj = users[0]._id; // Retrieve the _id of the first user found
		await setData(
			client,
			"leveling",
			{
				userid: memberId,
				serverid: serverId,
				experience: newExperience,
				level: newLevel,
				_id: userobj,
			},
			userobj
		);
	} else {
		await setData(client, "leveling", {
			userid: memberId,
			serverid: serverId,
			experience: newExperience,
			level: newLevel,
			_id: new ObjectId(),
		});
	}
}

// Updated function to get users between index x and y based on experience
export async function getUsersByExperienceRange(
	client: ClientExtended,
	serverId: string,
	x: number,
	y: number
): Promise<UserLeveling[]> {
	if (x < 0 || y < x) {
		throw new Error("Invalid indices: x must be >= 0 and y must be >= x.");
	}

	// Fetch all users and their experience from the "leveling" collection
	const users = (await listData(client, "leveling", {
		serverid: serverId,
	})) as UserLeveling[]; // Use the listData function

	// Sort and slice users
	const sortedUsers = users.sort((a, b) =>
		b.level === a.level ? b.experience - a.experience : b.level - a.level
	);
	const slicedUsers = sortedUsers.slice(x, y + 1);

	return slicedUsers; // Return the sliced users
}

export async function prettyExpGain(
	client: ClientExtended,
	user: User,
	guild: Guild,
	channel: Channel,
	multiplier: number = 1
): Promise<void> {
	const userId = user.id; // Get user ID
	const guildId = guild.id;
	const currentExperience = await getMemberExperience(
		client,
		userId,
		guildId
	); // Fetch current experience
	const currentLevel = await getMemberLevel(client, userId, guildId);
	const expGain = calculateExpGain(multiplier); // Calculate new experience gain
	const newExperience = currentExperience + expGain; // Update total experience
	const newLevel =
		calculateExpToNextLevel(currentLevel, newExperience) <= 0
			? currentLevel + 1
			: currentLevel;

	// Update experience in the database
	await updateMemberStats(
		client,
		userId,
		guildId,
		newLevel > currentLevel ? 0 : newExperience,
		newLevel
	);

	// Check if the user leveled up
	if (newLevel > currentLevel) {
		const embed = new EmbedBuilder()
			.setColor(0x9a2d7d) // Changed color to a more vibrant green
			.setTitle("🎉 Congratulations! 🎉") // Added icons to the title
			.setDescription(
				`<@!${userId}>, you leveled up to level ${newLevel} in ${channel.url}! 🎊\n\n-# If you don't want these messages, execute </userconf set:${
					client.application!.commands.cache.find(
						(command) => command.name === "userconf"
					)?.id ||
					(await client.application!.commands.fetch()).find(
						(command) => command.name === "userconf"
					)?.id
				}> and set \`leveling.levelupmessaging\` to \`false\``
			);

		// Send the embed message as a DM to the user

		const serverData = (await getData(client, "config", {
			userid: userId,
		})) as UserConfig[];
		let userConf: UserConfig;
		let levelUpMessagingSetting;
		if (serverData.length > 0) {
			userConf = serverData[0];

			levelUpMessagingSetting = getNestedKey(
				userConf.config,
				"leveling.levelupmessaging"
			);

			if (levelUpMessagingSetting === null) {
				levelUpMessagingSetting = true;
			}
		} else {
			levelUpMessagingSetting = true;
		}

		if (levelUpMessagingSetting) {
			try {
				await user.send({
					embeds: [embed],
					flags: [MessageFlags.SuppressNotifications],
				});
			} catch (error) {
				console.error(
					`Could not send DM to ${user.displayName}:`,
					error
				);
			}
		}
	}
}
