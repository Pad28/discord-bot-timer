import { get } from "env-var";
import * as dotenv from 'dotenv';

dotenv.config();

const DISCORD_TOKEN = get('DISCORD_TOKEN').required().asString();
const COMMAND_PREFIX = get('COMMAND_PREFIX').required().asString();
const NODE_ENV = get('NODE_ENV').required().asString();

export const envs = {
    DISCORD_TOKEN,
    COMMAND_PREFIX,
    NODE_ENV,
};