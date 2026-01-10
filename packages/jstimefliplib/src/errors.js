/**
 * TimeFlip error classes
 */

export class TimeFlipRuntimeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeFlipRuntimeError';
  }
}

export class NotConnectedError extends TimeFlipRuntimeError {
  constructor() {
    super('Not connected to device');
    this.name = 'NotConnectedError';
  }
}

export class NotLoggedInError extends TimeFlipRuntimeError {
  constructor() {
    super('Not logged in (incorrect password?)');
    this.name = 'NotLoggedInError';
  }
}

export class IncorrectPasswordError extends TimeFlipRuntimeError {
  constructor() {
    super('Incorrect password for device');
    this.name = 'IncorrectPasswordError';
  }
}

export class TimeFlipCommandError extends TimeFlipRuntimeError {
  constructor(command) {
    super(`Error while executing ${command}`);
    this.name = 'TimeFlipCommandError';
    this.command = command;
  }
}

export class UnimplementedFunctionError extends TimeFlipRuntimeError {
  constructor() {
    super('Function not implemented in this firmware version');
    this.name = 'UnimplementedFunctionError';
  }
}

export class DeprecatedFunctionError extends TimeFlipRuntimeError {
  constructor() {
    super('Function deprecated in this firmware version');
    this.name = 'DeprecatedFunctionError';
  }
}
