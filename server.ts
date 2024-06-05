import { createRequestHandler } from '@remix-run/architect';
import * as build from './build/server/index.js';
import { APIGatewayProxyHandlerV2 } from 'aws-lambda';

const requestHandler = createRequestHandler({
  build,
});

export const handler = (...args: Parameters<APIGatewayProxyHandlerV2>) => {
  const [apiGatewayEvent, ...rest] = args;
  /**
   * The api stage is forwarded to the request handler as a query parameter by API Gateway.
   * If you configure a different stage name (such as prod), you will need to update or automate this.
   */
  if (apiGatewayEvent.rawPath) {
    apiGatewayEvent.rawPath = apiGatewayEvent.rawPath.replace(/^\/dev/, '');
  }
  if (apiGatewayEvent.requestContext?.http?.path) {
    apiGatewayEvent.requestContext.http.path = apiGatewayEvent.requestContext.http.path.replace(/^\/dev/, '');
  }

  return requestHandler(apiGatewayEvent, ...rest);
};
