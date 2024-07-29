/*
 * Copyright 2024 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import express from 'express';
import Router from 'express-promise-router';
import dayjs from 'dayjs';
import { PluginDatabaseManager } from '@backstage/backend-common';
import { MiddlewareFactory } from '@backstage/backend-app-api';
import {
  LoggerService,
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
  SchedulerService,
  SchedulerServiceTaskScheduleDefinition,
} from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { Metric } from '@backstage-community/plugin-copilot-common';
import { DatabaseHandler } from '../db/DatabaseHandler';
import Scheduler from '../task/Scheduler';
import { GithubClient } from '../client/GithubClient';

/** @public */
export interface PluginOptions {
  schedule?: SchedulerServiceTaskScheduleDefinition;
}

/** @public */
export interface RouterOptions {
  logger: LoggerService;
  database: PluginDatabaseManager;
  scheduler: SchedulerService;
  config: Config;
}

const defaultSchedule: SchedulerServiceTaskScheduleDefinition = {
  frequency: { cron: '0 2 * * *' },
  timeout: { minutes: 15 },
  initialDelay: { minutes: 1 },
  scope: 'local',
};

/** @public */
export async function createRouter(
  routerOptions: RouterOptions,
  pluginOptions: PluginOptions,
): Promise<express.Router> {
  const { logger, database, scheduler, config } = routerOptions;
  const { schedule } = pluginOptions;

  const db = await DatabaseHandler.create({ database });
  const api = await GithubClient.fromConfig(config);

  await scheduler.scheduleTask({
    id: 'copilot-metrics',
    ...(schedule ?? defaultSchedule),
    fn: async () => await Scheduler.create({ db, logger, api, config }).run(),
  });

  const router = Router();
  router.use(express.json());

  router.get('/health', (_, response) => {
    logger.info('PONG!');
    response.json({ status: 'ok' });
  });

  router.get('/metrics', async (request, response) => {
    const { startDate, endDate } = request.query;

    if (typeof startDate !== 'string' || typeof endDate !== 'string') {
      return response.status(400).json('Invalid query parameters');
    }

    const parsedStartDate = dayjs(startDate);
    const parsedEndDate = dayjs(endDate);

    if (!parsedStartDate.isValid() || !parsedEndDate.isValid()) {
      return response.status(400).json('Invalid date format');
    }

    const result = await db.getByPeriod(startDate, endDate);

    const metrics: Metric[] = result.map(metric => ({
      ...metric,
      breakdown: JSON.parse(metric.breakdown),
    }));

    return response.json(metrics);
  });

  router.get('/metrics/period-range', async (_, response) => {
    const result = await db.getPeriodRange();

    if (!result) {
      return response.status(400).json('No available data');
    }

    return response.json(result);
  });

  router.use(MiddlewareFactory.create({ config, logger }).error);
  return router;
}

/** @public */
export async function createRouterFromConfig(routerOptions: RouterOptions) {
  const { config } = routerOptions;
  const pluginOptions: PluginOptions = {
    schedule: defaultSchedule,
  };
  if (config && config.has('copilot.schedule')) {
    pluginOptions.schedule =
      readSchedulerServiceTaskScheduleDefinitionFromConfig(
        config.getConfig('copilot.schedule'),
      );
  }
  return createRouter(routerOptions, pluginOptions);
}
