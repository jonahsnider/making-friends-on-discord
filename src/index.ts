import {PrismaClient} from '@prisma/client';
import {logger} from './logger';
import {Controller, Events} from './structures/controller';
import {FriendlyClient} from './structures/friendly-client';

const db = new PrismaClient();
const controller = new Controller();

async function start(): Promise<void> {
	await db.connect();

	// Initial start
	// Load all the friends who are not broken (meaning untested or working)
	const initialFriends = await db.friend.findMany({where: {areFriends: {not: false}}});

	const friends = new Map<string, FriendlyClient>();

	// Load the collection with data from the database marked as working
	initialFriends.forEach(data => {
		const client = new FriendlyClient(controller, db, data.friendCode);

		friends.set(data.friendCode, client);
	});

	controller
		.on(Events.Failure, (friendCode: string) => {
			logger.error(`Friend ${friendCode} failed to connect`);
			db.friend.update({where: {friendCode}, data: {areFriends: false}});

			friends.delete(friendCode);
		})
		.on(Events.Success, async (friendCode: string) => {
			logger.success(`Started new friend ${friendCode}`);
			await db.friend.update({where: {friendCode}, data: {areFriends: true}});
		})
		.on(Events.NewFriend, async (newFriendCode: string, parentFriendCode: string) => {
			// This will create the friend if they don't exist
			// If they exist it will do nothing
			const friend = await db.friend.upsert({
				where: {friendCode: newFriendCode},
				create: {friendCode: newFriendCode, parent: parentFriendCode},
				update: {}
			});

			const friendlyClient = new FriendlyClient(controller, db, friend.friendCode);

			friends.set(friend.friendCode, friendlyClient);

			friendlyClient.init();
		});

	logger.info(`Starting ${friends.size.toLocaleString()} clients`);

	// Start the clients
	friends.forEach(async friend => {
		await friend.init();
		logger.start(`${friend.friendCode} started`);
	});
}

start();
