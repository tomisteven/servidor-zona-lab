import { config } from 'dotenv';

import { validateEnvironment } from './validate-environment.js';

config({ quiet: true });

const env = validateEnvironment(process.env);

export default env;
