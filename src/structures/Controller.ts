import {EventEmitter} from 'events';

export enum Events {
	Success = 'success',
	Failure = 'failure',
	NewFriend = 'newFriend'
}

export class Controller extends EventEmitter {}
