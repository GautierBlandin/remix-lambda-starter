import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as synced from '@pulumi/synced-folder';
import * as url from 'url';

const stack = pulumi.getStack();

const bucket = new aws.s3.Bucket('bucket', {
  corsRules: [
    {
      allowedOrigins: ['*'],
      allowedMethods: ['GET', 'HEAD'],
      allowedHeaders: [],
      exposeHeaders: [],
      maxAgeSeconds: 300,
    },
  ],
});

const blockPublicAcls = new aws.s3.BucketPublicAccessBlock('public-access-block', {
  bucket: bucket.bucket,
  blockPublicAcls: false,
});

const ownershipControls = new aws.s3.BucketOwnershipControls('ownership-controls', {
  bucket: bucket.bucket,
  rule: {
    objectOwnership: 'ObjectWriter',
  },
});

new synced.S3BucketFolder(
  'synced-folder',
  {
    path: '../build/client',
    bucketName: bucket.bucket,
    acl: 'public-read',
  },
  { dependsOn: [ownershipControls, blockPublicAcls] },
);

const lambdaRole = new aws.iam.Role('lambdaRole', {
  assumeRolePolicy: {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'sts:AssumeRole',
        Principal: {
          Service: 'lambda.amazonaws.com',
        },
        Effect: 'Allow',
        Sid: '',
      },
    ],
  },
});

new aws.iam.RolePolicyAttachment('lambdaRoleAttachment', {
  role: lambdaRole,
  policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
});

const lambda = new aws.lambda.Function('lambdaFunction', {
  code: new pulumi.asset.AssetArchive({
    '.': new pulumi.asset.FileArchive('../build/lambda'),
  }),
  runtime: aws.lambda.Runtime.NodeJS20dX,
  role: lambdaRole.arn,
  handler: 'index.handler',
});

const apigw = new aws.apigatewayv2.Api('httpApiGateway', {
  protocolType: 'HTTP',
});

new aws.lambda.Permission('lambdaPermission', {
  action: 'lambda:InvokeFunction',
  principal: 'apigateway.amazonaws.com',
  function: lambda,
  sourceArn: pulumi.interpolate`${apigw.executionArn}/*/*`,
});

const integration = new aws.apigatewayv2.Integration('lambdaIntegration', {
  apiId: apigw.id,
  integrationType: 'AWS_PROXY',
  integrationUri: lambda.arn,
  payloadFormatVersion: '2.0',
});

const route = new aws.apigatewayv2.Route('apiRoute', {
  apiId: apigw.id,
  routeKey: '$default',
  target: pulumi.interpolate`integrations/${integration.id}`,
});

const stage = new aws.apigatewayv2.Stage('apiStage', {
  apiId: apigw.id,
  name: stack,
  routeSettings: [
    {
      routeKey: route.routeKey,
      throttlingBurstLimit: 5000,
      throttlingRateLimit: 10000,
    },
  ],
  autoDeploy: true,
});

const httpApiEndpoint = pulumi.interpolate`${apigw.apiEndpoint}/${stage.name}`;

const cloudfrontOAC = new aws.cloudfront.OriginAccessControl('cloudfrontOAC', {
  originAccessControlOriginType: 's3',
  signingBehavior: 'always', // always override authroization header
  signingProtocol: 'sigv4', // only allowed value
});

const cachingDisabledPolicyId = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad';
const cachingOptimizedPolicyId = '658327ea-f89d-4fab-a63d-7e88639e58f6';
const allVieverExceptHostHeaderPolicyId = 'b689b0a8-53d0-40ab-baf2-68738e2966ac';
const s3cachingPolicyId = stack === 'prod' ? cachingOptimizedPolicyId : cachingDisabledPolicyId;

const distribution = new aws.cloudfront.Distribution('distribution', {
  enabled: true,
  httpVersion: 'http2',
  origins: [
    {
      originId: 'S3Origin',
      domainName: bucket.bucketDomainName,
      originAccessControlId: cloudfrontOAC.id,
    },
    {
      originId: 'APIGatewayOrigin',
      domainName: pulumi.interpolate`${httpApiEndpoint.apply((endpoint) => url.parse(endpoint).hostname)}`,
      originPath: pulumi.interpolate`/${stack}`,
      customOriginConfig: {
        httpPort: 80,
        httpsPort: 443,
        originProtocolPolicy: 'https-only',
        originSslProtocols: ['TLSv1.2'],
      },
    },
  ],
  defaultRootObject: '',
  defaultCacheBehavior: {
    allowedMethods: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
    cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
    compress: false,
    cachePolicyId: cachingDisabledPolicyId,
    originRequestPolicyId: allVieverExceptHostHeaderPolicyId,
    targetOriginId: 'APIGatewayOrigin',
    viewerProtocolPolicy: 'redirect-to-https',
  },
  orderedCacheBehaviors: [
    {
      pathPattern: '/favicon.ico',
      allowedMethods: ['GET', 'HEAD'],
      cachedMethods: ['GET', 'HEAD'],
      compress: true,
      cachePolicyId: s3cachingPolicyId,
      targetOriginId: 'S3Origin',
      viewerProtocolPolicy: 'redirect-to-https',
    },
    {
      pathPattern: '/assets/*',
      allowedMethods: ['GET', 'HEAD'],
      cachedMethods: ['GET', 'HEAD'],
      compress: true,
      cachePolicyId: s3cachingPolicyId,
      targetOriginId: 'S3Origin',
      viewerProtocolPolicy: 'redirect-to-https',
    },
  ],
  restrictions: {
    geoRestriction: {
      restrictionType: 'none',
    },
  },
  viewerCertificate: {
    cloudfrontDefaultCertificate: true,
  },
});

new aws.s3.BucketPolicy('allowCloudFrontBucketPolicy', {
  bucket: bucket.bucket,
  policy: {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'AllowCloudFrontServicePrincipalRead',
        Effect: 'Allow',
        Principal: {
          Service: 'cloudfront.amazonaws.com',
        },
        Action: ['s3:GetObject'],
        Resource: pulumi.interpolate`${bucket.arn}/*`,
        Condition: {
          StringEquals: {
            'AWS:SourceArn': distribution.arn,
          },
        },
      },
    ],
  },
});

export const distributionDomain = pulumi.interpolate`${distribution.domainName}`;
