export class BotStateStore {
  async loadState() {
    throw new Error(
      "BotStateStore.loadState() must be implemented."
    );
  }

  async saveState(state) {
    throw new Error(
      "BotStateStore.saveState() must be implemented."
    );
  }
}
