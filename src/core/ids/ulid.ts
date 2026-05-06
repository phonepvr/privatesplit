import { ulid as makeUlid } from 'ulid';

export function newId(): string {
  return makeUlid();
}
