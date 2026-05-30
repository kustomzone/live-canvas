// Codebuddy CLI provider — wraps the existing codebuddyClient.callImageGen.
import { callImageGen } from '../../codebuddyClient.js';

export default {
  name: 'codebuddy',
  enabled(config) {
    return !!config.enableCodebuddy;
  },
  async generate({ imagePrompt, outputDir, size, seedImagePath, onEvent }) {
    return callImageGen({ imagePrompt, outputDir, size, seedImagePath, onEvent });
  },
};
