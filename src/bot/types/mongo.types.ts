import { TransactionStatus } from "../constants";

/**
 * Represents a Telegram user ID.
 */
export type TelegramUserId = string;

/**
 * Represents a Chain identifier.
 */
export type ChainId = string;

/**
 * Represents a Token address.
 */
export type TokenAddress = string;

/**
 * Represents an Amount of tokens.
 */
export type Amount = string;

/**
 * Represents parameters for a recipient in Hedgey.
 */
export type HedgeyRecipientParams = {
  /** The address of the recipient. */
  recipientAddress: string;
  /** The amount of tokens. */
  amount: Amount;
};

/**
 * Represents a MongoDB document for Transfer transactions.
 */
export type MongoTransfer = {
  /** Unique event identifier. */
  eventId: string;

  /** Chain identifier. */
  chainId: ChainId;

  /** Token symbol. */
  tokenSymbol: string;

  /** Token address. */
  tokenAddress: TokenAddress;

  /** Telegram ID of the sender. */
  senderTgId: TelegramUserId;

  /** Telegram ID of the recipient. */
  recipientTgId: TelegramUserId;

  /** Amount of tokens transferred. */
  tokenAmount: Amount;

  /** Status of the transaction. */
  status: TransactionStatus;

  /** Date when the transfer was added. */
  dateAdded: Date;

  /** Wallet address of the recipient. */
  recipientWallet: string;

  /** Handle of the sender. */
  senderHandle: string;

  /** Name of the sender. */
  senderName: string;

  /** Wallet address of the sender. */
  senderWallet: string;

  /** Transaction hash. */
  transactionHash: string;

  /** User operation hash. */
  userOpHash: string;

  /** Message associated to the transaction. */
  message?: string;
};

/**
 * Represents a MongoDB document for User details.
 */
export type MongoUser = {
  /** Telegram user ID. */
  userTelegramID: TelegramUserId;

  /** Response path. */
  responsePath: string;

  /** User handle. */
  userHandle: string;

  /** User name. */
  userName: string;

  /** Wallet address. */
  patchwallet: string;

  /** Optional Telegram session. */
  telegramSession?: string;
};

/**
 * Represents a MongoDB document for Reward transactions.
 */
export type MongoReward = {
  /** Telegram user ID. */
  userTelegramID: TelegramUserId;

  /** Response path. */
  responsePath: string;

  /** Wallet address. */
  walletAddress: string;

  /** Reason for reward. */
  reason: string;

  /** User handle. */
  userHandle: string;

  /** User name. */
  userName: string;

  /** Amount of the reward. */
  amount: Amount;

  /** Message associated with the reward. */
  message: string;

  /** Transaction hash. */
  transactionHash: string;

  /** User operation hash. */
  userOpHash: string;

  /** Date when the reward was added. */
  dateAdded: Date;

  /** Status of the transaction. */
  status: TransactionStatus;
};

/**
 * Represents a MongoDB document for Swap transactions.
 */
export type MongoSwap = {
  /** Unique event identifier. */
  eventId: string;

  /** Chain identifier. */
  chainId: ChainId;

  /** Address of the recipient. */
  to: string;

  /** Telegram user ID. */
  userTelegramID: TelegramUserId;

  /** Token in. */
  tokenIn: string;

  /** Amount of token in. */
  amountIn: Amount;

  /** Token out. */
  tokenOut: string;

  /** Amount of token out. */
  amountOut: Amount;

  /** Price impact. */
  priceImpact: string;

  /** Gas used. */
  gas: string;

  /** Status of the transaction. */
  status: TransactionStatus;

  /** Date when the swap was added. */
  dateAdded: Date;

  /** Transaction hash. */
  transactionHash: string;

  /** User operation hash. */
  userOpHash: string;

  /** User handle. */
  userHandle: string;

  /** User name. */
  userName: string;

  /** User wallet. */
  userWallet: string;
};

/**
 * Represents a MongoDB document for Vesting details.
 */
export type MongoVesting = {
  /** Unique event identifier. */
  eventId: string;

  /** Chain identifier. */
  chainId: ChainId;

  /** Token symbol. */
  tokenSymbol: string;

  /** Token address. */
  tokenAddress: TokenAddress;

  /** Telegram ID of the sender. */
  senderTgId: TelegramUserId;

  /** Wallet address of the sender. */
  senderWallet: string;

  /** Name of the sender. */
  senderName: string;

  /** Handle of the sender. */
  senderHandle: string;

  /** Recipients with Vesting details. */
  recipients: HedgeyRecipientParams[];

  /** Status of the transaction. */
  status: TransactionStatus;

  /** Date when the vesting was added. */
  dateAdded: Date;

  /** Transaction hash. */
  transactionHash: string;

  /** User operation hash. */
  userOpHash: string;
};
