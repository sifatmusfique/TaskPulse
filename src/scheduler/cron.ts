import { CronExpressionParser } from 'cron-parser';

export class CronScheduler {
  /**
   * Calculates the next execution Date for a given standard 5 or 6 field cron expression.
   */
  public static getNextRun(cronExpression: string, fromDate: Date = new Date()): Date {
    try {
      const interval = CronExpressionParser.parse(cronExpression, {
        currentDate: fromDate,
      });
      return interval.next().toDate();
    } catch (err: unknown) {
      throw new Error(`Invalid cron expression "${cronExpression}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Validates if a string is a valid cron pattern.
   */
  public static isValid(cronExpression: string): boolean {
    try {
      CronExpressionParser.parse(cronExpression);
      return true;
    } catch {
      return false;
    }
  }
}
