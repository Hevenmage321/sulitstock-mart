import { initializeMarketplace } from './marketplace-ui.js';
import { initializeInbox } from './messaging-ui.js';

initializeInbox(initializeMarketplace(() => {}));
