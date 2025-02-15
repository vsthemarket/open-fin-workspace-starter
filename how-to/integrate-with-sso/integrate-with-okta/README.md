![OpenFin Workspace Example Application -- Integrate with SSO - Okta](../../../assets/OpenFin-Workspace-Starter.png)

> **_:information_source: OpenFin Workspace:_** [OpenFin Workspace](https://www.openfin.co/workspace/) is a commercial product and this repo is for evaluation purposes (See [LICENSE.MD](LICENSE.MD)). Use of the OpenFin Container and OpenFin Workspace components is only granted pursuant to a license from OpenFin (see [manifest](public/manifest.fin.json)). Please [**contact us**](https://www.openfin.co/workspace/poc/) if you would like to request a developer evaluation key or to discuss a production license.
> OpenFin Workspace is currently **only supported on Windows** although you can run the sample on a Mac for development purposes.

# Integrate with Okta

Your OpenFin application will often need to authenticate with the Okta provider before use, this examples demonstrates such an integration.

This application you are about to install is a simple example of plugging in your own content or app. This example assumes you have already [set up your development environment](https://developers.openfin.co/of-docs/docs/set-up-your-dev-environment)

## Running the Sample

To run this sample you can:

- Clone this repo and follow the instructions below. This will let you customize the sample to learn more about our APIs.

## Getting Started

1. Install dependencies and build the sample. Note that these examples assume you are in the sub-directory for the example.

```shell
npm run setup
```

2. Configure the SSO provider

This example uses [Okta](https://developer.okta.com/) as a provider for the SSO features, you can sign-up for a free account to test this demonstration.

Okta Integration Pre-Requisites:
In order to integrate an SPA with Okta please refer to this link: <https://developer.okta.com/docs/guides/sign-into-spa-redirect/vue/main/>

After creating the Okta integration using the example above, populate the `customSettings` in the `public/manifest.fin.json` file in the repo. The `domain` and `clientId` values can be viewed in the settings for the application on the Okta Admin management console.

The `pkceCodeVerifier` and `pkceCodeChallenge` are provided, but for more details on replacing these with your own values see [Implement authorization by grant type PKCE](https://developer.okta.com/docs/guides/implement-grant-type/authcodepkce/main/)

```json
"customSettings": {
  "auth": {
   "domain": "<DOMAIN>",
   "clientId": "<CLIENTID>",
   "pkceCodeVerifier": "Zg6klgrnixQJ629GsawRMV8MjWvwRAr-vyvP1MHnB6X8WKZN",
   "pkceCodeChallenge": "iF_7prUeJ6rr3jMG3LmhW3R1cZ2ecZavFqS0jtb6tzo",
   "loginUrl": "http://localhost:8080/platform/login-complete.html",
   "logoutUrl": "http://localhost:8080/platform/logout.html",
   "appUrl": "http://localhost:8080/platform/app.html",
   "verifyPollMs": 10000
  }
 }
```

The login url `http://localhost:8080/platform/login-complete.html` needs to be added in the Okta dashboard for the app as an **Allowed Callback Url**.

The logout urls contain `http://localhost:8080/platform/logout-complete.html` which needs to be added in the Okta dashboard for the app app config as a **Allowed Logout Url**, this is the default completion url for the logout flow.

If you enable additional federated providers in Okta you might need additional logout urls.

3. Optional (if you wish to pin the version of OpenFin Workspace to version 11.0.0 and you are on Windows) - Set Windows registry key for [Desktop Owner Settings](https://developers.openfin.co/docs/desktop-owner-settings).
   This example runs a utility [desktop-owner-settings.bat](../../common/desktop-owner-settings.bat) that adds the Windows registry key for you, pointing to a local desktop owner
   settings file so you can test these settings. If you already have a desktop owner settings file, this script prompts to overwrite the location. Be sure to capture the existing location so you can update the key when you are done using this example.

   (**WARNING**: This script kills all open OpenFin processes. **This is not something you should do in production to close apps as force killing processes could kill an application while it's trying to save state/perform an action**).

```shell
npm run dos
```

4. Start the test server in a new window.

```shell
npm run start
```

5. Start the demonstration application.

```shell
npm run client
```

6. Build the project if you have modified the code.

```shell
npm run build
```

![Integrate with Okta](openfin-integrate-with-sso-okta.gif)

---

### Read more about [working with Workspace](https://developers.openfin.co/of-docs/docs/overview-of-workspace)
