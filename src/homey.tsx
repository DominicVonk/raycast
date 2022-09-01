import { List, OAuth, Action, ActionPanel, Icon, Color } from "@raycast/api";
import { AthomCloudAPI, HomeyAPI, HomeyAPIV3, HomeyAPIV3Cloud, HomeyAPIV3Local } from "homey-api";
import { useState, useEffect } from "react";
import express from 'express';
import { LocalStorage } from "@raycast/api";
import { showToast, Toast } from "@raycast/api";

class Storage extends AthomCloudAPI.StorageAdapter {
    async get (): Promise<any> {
        const data = await LocalStorage.getItem<string>('athom');
        return data ? JSON.parse(data) : {};
    }
    async set (value: any): Promise<void> {
        return LocalStorage.setItem('athom', JSON.stringify(value));
    }
}

export default function Command () {
    const [flows, setFlows] = useState<any[]>([
    ]);
    const [homeyApi, setHomeyApi] = useState<HomeyAPI>();
    const [homey, setHomey] = useState<any>();
    useEffect(() => {
        if (!homeyApi) {
            const fetchData = async () => {
                let token = null;
                const code = await LocalStorage.getItem<string>('_token') as string;
                let __token = undefined;
                if (code) {

                    //@ts-ignore
                    __token = new AthomCloudAPI.Token(JSON.parse(code));
                }
                // Create a Cloud API instance
                const cloudApi = new AthomCloudAPI({
                    clientId: '5a8d4ca6eb9f7a2c9d6ccf6d',
                    clientSecret: 'e3ace394af9f615857ceaa61b053f966ddcfb12a',
                    redirectUrl: 'http://localhost/oauth2/callback',

                    //@ts-ignore
                    token: __token,
                    store: new Storage()
                });
                const loggedIn = await cloudApi.isLoggedIn();
                if (!loggedIn) {


                    const client = new OAuth.PKCEClient({
                        redirectMethod: OAuth.RedirectMethod.Web,
                        providerName: "Homey",
                        providerIcon: "8502422.png",
                        description: "Connect your Homey account...",

                    });

                    const promise = new Promise((resolve, reject) => {

                        const server = express();
                        let _server: any = null;
                        let state: any = null;
                        server.get('/oauth2/callback', async (req, res) => {
                            const token = req.query.code;

                            res.redirect('https://raycast.com/redirect?packageName=Extension&state=' + state + '&code=' + token);

                            _server?.close();
                            resolve(token)
                        });

                        server.get('/oauth2', async (req, res) => {
                            state = req.query.state;

                            //@ts-ignore
                            res.redirect(cloudApi.getLoginUrl());
                        });

                        _server = server.listen(80);
                    });
                    const request = await client.authorizationRequest({
                        scope: "homey",
                        clientId: '5a8d4ca6eb9f7a2c9d6ccf6d',
                        endpoint: "http://localhost/oauth2",
                    });
                    try {
                        const req = await client.authorize(request);
                    } catch (error) {
                        console.log(error);
                    }
                    const data = await promise;
                    token = (data as string)

                }

                if (token) {
                    //await new Promise((r) => { setTimeout(r, 10000) });

                    //@ts-ignore
                    const _token = await cloudApi.authenticateWithAuthorizationCode({ code: token });
                    await LocalStorage.setItem('_token', JSON.stringify(_token));
                }
                // Get the logged in user
                const user = (await cloudApi.getAuthenticatedUser({ additionalScopes: '' })) as AthomCloudAPI.User;
                // Get the first Homey of the logged in user
                const homey = await user.getFirstHomey();
                setHomey(homey);
                // Create a session on this Homey

                //@ts-ignore
                const homeyApi = await homey.authenticate();

                setHomeyApi(homeyApi);
            }

            fetchData();
        }
    }, [])

    useEffect(() => {
        if (homeyApi) {
            const fetchData = async () => {
                const directory: { [key: string]: { name: string, order: number, flows: any[] } } = {}
                const flowFolders = await homeyApi.flow.getFlowFolders();
                const folders = Object.values(flowFolders);
                directory['general'] = {
                    id: 'general',
                    name: 'general',
                    order: 9999,
                    flows: []
                };
                for (const folder of folders) {
                    directory[folder.id] = {
                        id: folder.id,
                        name: folder.name,
                        order: folder.order,
                        flows: []
                    };
                }
                //@ts-ignore
                const todos = await homeyApi.flow.getFlows();
                const flows = Object.values(todos);
                for (const flow of flows) {
                    directory[flow.folder || 'general'].flows.push(flow);

                }
                //  console.log(todos);
                //@ts-ignore
                setFlows(Object.values(directory));
            }
            fetchData();
        }
    }, [homeyApi]);

    return (
        <List>
            {flows.sort((a, b) => Math.sign(b.order - a.order)).map((folder) => (
                <List.Section key={folder.name} title={folder.name}>
                    {folder.flows && folder.flows.sort((a, b) => Math.sign(b.order - a.order)).map((flow) => (
                        <List.Item key={flow.id} icon={{ source: flow.triggerable && flow.enabled ? Icon.PlayFilled : Icon.XMarkCircleFilled, tintColor: flow.triggerable && flow.enabled ? Color.Green : Color.Red }} title={flow.name} actions={<ActionPanel title={flow.name}>
                            <ActionPanel.Section>
                                {flow.triggerable && flow.enabled && <Action title="Run flow" onAction={async () => {

                                    //@ts-ignore
                                    await homeyApi.flow.triggerFlow({ id: flow.id });
                                    await showToast({
                                        title: "Flow triggered",
                                        message: flow.name,
                                        style: Toast.Style.Success,
                                    })
                                }}></Action>}
                                <Action.OpenInBrowser title="Goto flow editor" url={'https://my.homey.app/homeys/' + homey.id + '/flows/' + flow.id}></Action.OpenInBrowser>
                            </ActionPanel.Section>
                        </ActionPanel>} />

                    ))}
                </List.Section>
            ))}
        </List>

    );
}