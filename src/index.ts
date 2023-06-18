import process from "process";

export class AsyncRequestQueue {
  #queue: {
    task: () => Promise<unknown>;
    index: number;
  }[];
  #currentTask: number;
  #currentIndex: number;
  retries: number;
  maxConcurrent: number;

  constructor({ maxConcurrent = 3, retries = 3 }) {
    this.#queue = [];
    this.#currentIndex = 0;
    this.#currentTask = 0;
    this.maxConcurrent = maxConcurrent;
    this.retries = retries;
  }

  async enqueue(promiseFactory: () => Promise<unknown>) {
    this.#queue.push({
      task: promiseFactory,
      index: this.#currentIndex++,
    });
    await this.#executeNext();
  }

  async #loadWithRetry(
    task: {
      task: () => Promise<unknown>;
      index: number;
    },
    retryCount: number
  ) {
    try {
      if (retryCount === this.retries) {
        this.#currentTask++;
      }
      console.log(`task ${task.index} start`);
      await task.task();
    } catch (err) {
      if (retryCount <= 0) {
        throw new Error(
          `Task ${task.index} failed to load after ${this.retries} retries`
        );
      }
      console.log(
        `Task ${task.index} retry for ${retryCount} times, after 1 second`
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await this.#loadWithRetry(task, retryCount - 1);
    }
  }

  async #executeNext() {
    if (this.#currentTask >= this.maxConcurrent) {
      return;
    }
    const task = this.#queue.shift();
    if (task) {
      try {
        await this.#loadWithRetry(task, this.retries);
      } catch (err) {
      } finally {
        this.#currentTask--;
        this.#executeNext();
      }
    }
  }
}

const sleep = (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(`sleep for ${ms / 1000} seconds`);
      resolve(ms / 1000);
    }, ms);
  });
};

const queue = new AsyncRequestQueue({ maxConcurrent: 3, retries: 3 });

queue.enqueue(async () => {
  return sleep(1000);
});
queue.enqueue(async () => {
  return sleep(10000);
});
queue.enqueue(async () => {
  return sleep(3000);
});
queue.enqueue(async () => {
  return Promise.reject("aa");
});
queue.enqueue(async () => {
  return sleep(1500);
});
queue.enqueue(async () => {
  return sleep(1500);
});
queue.enqueue(async () => {
  return sleep(1500);
});

process.on("uncaughtException", function (err: Error) {
  console.log("Caught exception: ", err);
});
