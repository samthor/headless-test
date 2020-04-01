
export type ServerOption = http.Server | https.Server | URL | string;

export interface TestOptions {

  /**
   * Arguments passed to Puppeteer.
   */
  args?: Array<string>;

  /**
   * Whether to run in headless mode. Default true, but can be set to false for testing.
   */
  headless?: boolean;

  /**
   * Resources to load from the passed server. These are only requested via HTTP.
   */
  load?: Array<string>;

  /**
   * Options to pass to the test driver (currently just Mocha, in `mocha.setup`).
   */
  driver?: Object<any>;

  /**
   * Optional timeout that tests can run for. If this isn't set, uses the default for the driver.
   */
  timeout?: number;
}

/**
 * Runs tests from the given server with the specified options, including which resources to load.
 * Returns a boring `Promise` that rejects on test failure.
 */
export default function(server: ServerOption, options: TestOptions): Promise<void>;
