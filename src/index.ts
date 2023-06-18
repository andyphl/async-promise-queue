import process from "process";

type Task<T> = {
  task: () => Promise<T>;
  index: number;
  onSuccess?: (value: T) => void;
  onError?: (err: Error) => void;
  onRetry?: (err: Error) => void;
};
export class AsyncRequestQueue {
  #queue: Task<any>[];
  #currentTask: number;
  #currentIndex: number;
  retries: number;
  maxConcurrent: number;

  constructor({
    maxConcurrent = 3,
    retries = 3,
  }: {
    maxConcurrent?: number;
    retries?: number;
  }) {
    this.#queue = [];
    this.#currentIndex = 0;
    this.#currentTask = 0;
    this.maxConcurrent = maxConcurrent;
    this.retries = retries;
  }

  async enqueue<T>(
    promiseFactory: () => Promise<T>,
    {
      onRetry,
      onError,
      onSuccess,
    }: Pick<Task<T>, "onSuccess" | "onError" | "onRetry"> = {}
  ) {
    this.#queue.push({
      task: promiseFactory,
      index: this.#currentIndex++,
      onRetry,
      onError,
      onSuccess: onSuccess as (value: T) => void,
    });
    await this.#executeNext();
  }

  async #loadWithRetry(taskObj: Task<any>, retryCount: number) {
    try {
      if (retryCount === this.retries) {
        this.#currentTask++;
      }
      console.log(`task ${taskObj.index} start`);
      return await taskObj.task();
    } catch (err) {
      if (retryCount <= 0) {
        throw new Error(
          `Task ${taskObj.index} failed to load after ${this.retries} retries`
        );
      }
      taskObj.onRetry?.(err as Error);
      console.log(
        `Task ${taskObj.index} retry for ${
          this.retries - retryCount + 1
        } times, after 1 second`
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await this.#loadWithRetry(taskObj, retryCount - 1);
    }
  }

  async #executeNext() {
    if (this.#currentTask >= this.maxConcurrent) {
      return;
    }
    const taskObj = this.#queue.shift();
    if (taskObj) {
      try {
        const taskValue = await this.#loadWithRetry(taskObj, this.retries);
        taskObj.onSuccess?.(taskValue);
      } catch (err) {
        taskObj.onError?.(err as Error);
      } finally {
        this.#currentTask--;
        this.#executeNext();
      }
    }
  }
}

const sleep = (ms: number) => {
  return new Promise<number>((resolve) => {
    setTimeout(() => {
      console.log(`sleep for ${ms / 1000} seconds`);
      resolve(ms / 1000);
    }, ms);
  });
};

const queue = new AsyncRequestQueue({ maxConcurrent: 3, retries: 3 });

queue.enqueue(
  async () => {
    return sleep(1000);
  },
  {
    onSuccess: (value) => {
      console.log("Sleep 1000 success", value);
    },
  }
);
queue.enqueue(async () => {
  return sleep(10000);
});
queue.enqueue(async () => {
  return sleep(3000);
});
queue.enqueue(
  async () => {
    return Promise.reject("aa");
  },
  {
    onError: (err) => {
      console.log("Reject aa on error", err);
    },
  }
);
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
