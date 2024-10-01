import type { ObjectId } from "mongodb";
import type { ClientExtended } from "./classes.ts";
import { getData, setData, listData } from "./mongohelper.ts"; // Import mongoHelpers functions
import { User, EmbedBuilder } from "discord.js";

interface UserExperience {
	userId: string;
	experience: number;
	_id: ObjectId;
}

// Function to calculate experience gain
export function calculateExpGain(): number {
	const randomChance = Math.random() * 100; // Get a random number from 0 to 99.99

	// If the random chance is less than or equal to 2, calculate a random amount around 15
	if (randomChance <= 2) {
		// Add a small random variation between -5 and +5
		const variation = Math.floor(Math.random() * 11) - 5; // Random number between -5 and 5
		const expGain = 15 + variation; // Calculate XP gain

		// Ensure the value does not fall below 1
		return Math.max(expGain, 1);
	} else {
		// Otherwise, generate a random number between 1 and 3
		return Math.floor(Math.random() * 3) + 1; // Returns 1, 2, or 3
	}
}

// Function to calculate experience required to reach the next level based on a quadratic equation
export function calculateExpToNextLevel(currentLevel: number): number {
	// Coefficients for the quadratic function
	const a = 2;
	const b = 50;
	const c = 100;

	// Quadratic formula to calculate experience needed
	const expNeeded = a * Math.pow(currentLevel, 2) + b * currentLevel + c;

	return Math.floor(expNeeded / 10); // Return the experience needed for the next level
}

// Function to calculate the level based on total experience
export function calculateLevelFromExperience(totalExperience: number): number {
	let currentLevel = 0;
	let accumulatedExperience = 0;

	// Keep leveling up until the total experience is consumed
	while (true) {
		const experienceNeeded = calculateExpToNextLevel(currentLevel);

		if (accumulatedExperience + experienceNeeded <= totalExperience) {
			accumulatedExperience += experienceNeeded;
			currentLevel++;
		} else {
			break; // Not enough experience to level up
		}
	}

	return currentLevel; // Return the calculated level
}

// Updated function to get member experience using mongoHelper
export async function getMemberExperience(
	client: ClientExtended,
	memberId: string,
): Promise<number> {
	const users = await getData(client, "levels", { userId: memberId });
	return users.length > 0 ? users[0].experience : 0; // Return user experience or 0 if not found
}

// Updated function to update member experience using mongoHelper
export async function updateMemberExperience(
	client: ClientExtended,
	memberId: string,
	newExperience: number,
) {
	// Step 1: Fetch existing user data
	const users = await getData(client, "levels", { userId: memberId });

	if (users.length > 0) {
		// Step 2: If the user exists, update their experience
		const userId = users[0]._id; // Retrieve the _id of the first user found
		await setData(
			client,
			"levels",
			{ userId: memberId, experience: newExperience },
			userId,
		); // Update using the ObjectId directly
	} else {
		// Step 3: If the user doesn't exist, create a new entry
		await setData(client, "levels", {
			userId: memberId,
			experience: newExperience,
		}); // Insert as a new document
	}
}

// Updated function to get experience needed for next level
export function calculateExperienceFromLevel(level: number): number {
	let accumulatedExperience = 0;
	let currentLevel = 0;

	// Keep leveling up until the total experience is consumed
	while (true) {
		const experienceNeeded = calculateExpToNextLevel(currentLevel);

		if (currentLevel + 1 <= level) {
			accumulatedExperience += experienceNeeded;
			currentLevel++;
		} else {
			break; // Not enough experience to level up
		}
	}

	return accumulatedExperience;
}

// Updated function to get users between index x and y based on experience
export async function getUsersByExperienceRange(
	client: ClientExtended,
	x: number,
	y: number,
): Promise<UserExperience[]> {
	if (x < 0 || y < x) {
		throw new Error("Invalid indices: x must be >= 0 and y must be >= x.");
	}

	// Fetch all users and their experience from the "levels" collection
	const users = await listData(client, "levels"); // Use the listData function

	// Sort and slice users
	const sortedUsers = users.sort((a, b) => b.experience - a.experience);
	const slicedUsers = sortedUsers.slice(x, y + 1);

	// Map sliced users to the defined interface structure
	const result: UserExperience[] = slicedUsers.map((user) => ({
		userId: user.userId,
		experience: user.experience,
		_id: user._id,
	}));

	return result; // Return the sliced users
}

export async function prettyExpGain(
	client: ClientExtended,
	user: User,
): Promise<void> {
	const userId = user.id; // Get user ID
	const currentExperience = await getMemberExperience(client, userId); // Fetch current experience
	const expGain = calculateExpGain(); // Calculate new experience gain
	const newExperience = currentExperience + expGain; // Update total experience

	// Retrieve current level before updating
	const currentLevel = calculateLevelFromExperience(currentExperience);
	const newLevel = calculateLevelFromExperience(newExperience); // Calculate new level

	// Update experience in the database
	await updateMemberExperience(client, userId, newExperience);

	// Check if the user leveled up
	if (newLevel > currentLevel) {
		const expNeededForNextLevel = calculateExperienceFromLevel(
			newLevel + 1,
		); // Get EXP needed for next level

		const embed = new EmbedBuilder()
			.setColor("#4caf50") // Changed color to a more vibrant green
			.setTitle("🎉 Congratulations! 🎉") // Added icons to the title
			.setDescription(`<@!${userId}>, you leveled up! 🎊`) // Added an emoji to the description
			.addFields(
				{
					name: "New Level",
					value: `${newLevel}`,
					inline: false,
				}, // Added an emoji
				{
					name: "Experience",
					value: `${newExperience}`,
					inline: false,
				}, // Added an emoji
				{
					name: "EXP Needed for Next Level",
					value: `${expNeededForNextLevel}`,
					inline: false,
				}, // Added an emoji
			)
			.setTimestamp()
			.setFooter({ text: "Keep pushing forward! 🚀" }); // Correctly formatted footer

		// Send the embed message as a DM to the user
		try {
			await user.send({ embeds: [embed] });
		} catch (error) {
			console.error(`Could not send DM to ${user.username}:`, error);
		}
	}
}
