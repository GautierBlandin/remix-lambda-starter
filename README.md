# Welcome to Remix + Vite on Lambda!

📖 See the [Remix docs](https://remix.run/docs) and the [Remix Vite docs](https://remix.run/docs/en/main/guides/vite) for details on supported features.

## Development

Run the Vite dev server:

```shellscript
npm run dev
```

## Deployment

First, build your app for production:

```sh
npm run build
```

Then run the app in production mode:

```sh
npm start
```

### Deploy

Install the [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)

Install the infrastructure dependencies and configure your AWS credentials:
```sh
cd infrastructure
npm install
pulumi config set aws:region <your-region>
pulumi config set aws:accessKey <your-access-key>
pulumi config set aws:secretKey <your-secret-key> --secret
cd ..
```

Deploy the infrastructure:
```sh
npm run deploy
```

Build the application and deploy it to the infrastructure:
```sh
npm run build-deploy
```

This starter repo is completely within the AWS free tier, so no need to worry about any costs.
