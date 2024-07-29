/*
 * Copyright 2022 The Backstage Authors
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

import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { ResponseError } from '@backstage/errors';
import { CopilotApi } from './CopilotApi';
import { Metric, PeriodRange } from '@backstage-community/plugin-copilot-common';
import dayjs from 'dayjs';

export class CopilotClient implements CopilotApi {
  public constructor(
    private readonly options: {
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
    },
  ) {}

  public async getMetrics(startDate: Date, endDate: Date): Promise<Metric[]> {
    const queryString = new URLSearchParams();

    queryString.append('startDate', dayjs(startDate).format('YYYY-MM-DD'));
    queryString.append('endDate', dayjs(endDate).format('YYYY-MM-DD'));

    const urlSegment = `metrics?${queryString}`;

    return await this.get<Metric[]>(urlSegment);
  }

  public async periodRange() {
    const urlSegment = `metrics/period-range`;

    return await this.get<PeriodRange>(urlSegment);
  }

  private async get<T>(path: string): Promise<T> {
    const baseUrl = await this.options.discoveryApi.getBaseUrl('copilot');
    const response = await this.options.fetchApi.fetch(`${baseUrl}/${path}`);

    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }

    return response.json() as Promise<T>;
  }
}
