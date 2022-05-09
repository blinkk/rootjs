import {ServerResponse} from 'http';
import {IncomingMessage, NextFunction as ConnectNextFn} from 'connect';
import {DecodedIdToken} from 'firebase-admin/lib/auth/token-verifier';

export type User = DecodedIdToken;

export type Request = IncomingMessage & {
  currentUser?: User;
};

export type Response = ServerResponse;

export type NextFunction = ConnectNextFn;
