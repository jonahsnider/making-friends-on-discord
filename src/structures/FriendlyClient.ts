import {Client, Message, PartialMessage, Intents, ActivityFlags} from 'discord.js';
import {friendCodeRegExps} from '../constants';
import {PrismaClient, Friend} from '@prisma/client';
import {logger} from '../logger';
import {Controller, Events} from './Controller';

export class FriendlyClient extends Client {
	db: PrismaClient;
	friendCode: string;
	controller: Controller;

	constructor(controller: Controller, db: PrismaClient, friendCode: string) {
		super({
			messageCacheMaxSize: 1,
			messageCacheLifetime: 60,
			messageSweepInterval: 45,
			partials: ['MESSAGE'],
			presence:
			process.env.NODE_ENV === 'production' ? undefined : {activity: {name: 'for new friends', type: 'WATCHING'}},
			// Enabling these intents will only allow DMs to go through for whatever reason
			// ws: {intents: [Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.GUILD_MESSAGES]}
		});

		this.controller = controller;
		this.db = db;
		this.friendCode = friendCode;
	}

	processMultipleMessages(...messages: Array<Message | PartialMessage>) {
		Array.from(messages.values()).forEach(message => this.processMessage(message));
	}

	listen() {
		this.on('message', this.processMessage);
		this.on('messageDelete', this.processMessage);
		this.on('messageUpdate', this.processMultipleMessages);
		this.on('messageDeleteBulk', this.processMultipleMessages);
	}

	/**
	 * Process a message for content that can be used to find friends.
	 * @param message Message to process
	 * @returns The number of friend codes that were added to the queue
	 */
	processMessage(message: Message | PartialMessage): number {
		// Arbitrary number to help prune results early on
		if (message.content && message.content.length >= 50) {
			const queued: string[] = [];

			logger.debug(
				`Processing message ${message.id} in channel ${message.channel?.id ??
					'(not included due to partial message)'} ${message.channel?.type === 'text' ? message.channel.name : 'dm'}`
			);

			Object.values(friendCodeRegExps).forEach(regex => {
				if (message.content !== null) {
					let matches;

					while ((matches = regex.exec(message.content)) !== null) {
						// This is necessary to avoid infinite loops with zero-width matches
						if (matches.index === regex.lastIndex) {
							regex.lastIndex++;
						}

						// The result can be accessed through the `m`-variable.
						queued.push(matches[0]);
					}
				}
			});

			logger.debug(`Found ${queued.length} friends: ${queued.join(', ')}`);

			queued.forEach(friendCode => this.addFriendToQueue(friendCode));

			return queued.length;
		}

		return 0;
	}

	/**
	 * Add a friend to the queue. If they are already in the queue they will not be added.
	 * @param newFriendCode Friend code to use
	 */
	addFriendToQueue(newFriendCode: string): void {
		this.controller.emit(Events.NewFriend, newFriendCode, this.friendCode);
	}

	async init() {
		this.listen();

		try {
			await this.login(this.friendCode);
		} catch (error) {
			logger.error(`Unable to use friend code ${this.friendCode}, marking it as non functional`);
			this.controller.emit(Events.Failure, this.friendCode);
			this.destroy();
		}

		logger.success(`Friend ${this.friendCode} ready, watching ${this.guilds.cache.size.toLocaleString()} guilds`);
		this.controller.emit(Events.Success, this.friendCode);
	}
}
