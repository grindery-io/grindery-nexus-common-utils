import { ethers } from "ethers";
import Joi from "joi";

export const HexDataSchema = Joi.string().custom((value, helpers) =>
  ethers.isHexString(value, true) ? value.toLowerCase() : helpers.error("any.invalid")
);
export const HexValueSchema = Joi.string()
  .default("0")
  .custom((value, helpers) => {
    try {
      return ethers.toBeHex(value, 32);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      return helpers.error("any.invalid");
    }
  });
export const AddressSchema = Joi.string().custom((value, helpers) =>
  ethers.isAddress(value) ? ethers.getAddress(value) : helpers.error("any.invalid")
);
