import Joi, { SchemaMap } from "joi";
import { ForbidAny } from "../forbidAny";

export type ExtractSchemaType<Type> =
  Type extends Joi.ObjectSchema<infer X> ? X : Type extends Joi.AnySchema<infer X> ? X : never;
export function objectSchema<
  TSchema extends { [key: string]: Joi.AnySchema },
  TObject extends {
    [key in keyof TSchema]: ExtractSchemaType<TSchema[key]>;
  },
>(schema: TSchema): Joi.ObjectSchema<ForbidAny<TObject>> {
  return Joi.object(schema);
}
export function optional<T>(schema: Joi.AnySchema<T>): Joi.AnySchema<T | undefined> {
  return schema.optional();
}

export function joiAttempt<T>(value: T, schema: SchemaMap<T, true>, options?: Joi.ValidationOptions): ForbidAny<T> {
  return Joi.attempt(value, Joi.object(schema), { allowUnknown: true, abortEarly: false, ...options });
}
