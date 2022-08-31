import { List, OAuth, Action, ActionPanel } from "@raycast/api";
import { AthomCloudAPI, HomeyAPI } from "homey-api";
import { useState, useEffect } from "react";
import express from 'express';
import { LocalStorage } from "@raycast/api";
import { showToast, Toast } from "@raycast/api";

class Storage extends AthomCloudAPI.StorageAdapter {
    async get (): Promise<any> {
        const data = await LocalStorage.getItem('athom');
        return data ? JSON.parse(data) : {};
    }
    async set (value: any): Promise<void> {
        return LocalStorage.setItem('athom', JSON.stringify(value));
    }
}

export default function Command () {
    const [todos, setTodos] = useState<any[]>([
    ]);
    const [homey, setHomey] = useState<HomeyAPI>();
    useEffect(() => {
        if (!homey) {
            const fetchData = async () => {
                let token = null;
                const code = await LocalStorage.getItem('_token') as string;
                const __token = new AthomCloudAPI.Token(JSON.parse(code));

                // Create a Cloud API instance
                const cloudApi = new AthomCloudAPI({
                    clientId: '5a8d4ca6eb9f7a2c9d6ccf6d',
                    clientSecret: 'e3ace394af9f615857ceaa61b053f966ddcfb12a',
                    redirectUrl: 'http://localhost/oauth2/callback',
                    token: code ? __token : undefined,
                    store: new Storage()
                });
                const loggedIn = await cloudApi.isLoggedIn();

                if (!loggedIn) {


                    const client = new OAuth.PKCEClient({
                        redirectMethod: OAuth.RedirectMethod.Web,
                        providerName: "Homey",
                        providerIcon: "twitter-logo.png",
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
                    const _token = await cloudApi.authenticateWithAuthorizationCode({ code: token });
                    await LocalStorage.setItem('_token', JSON.stringify(_token));
                }
                // Get the logged in user
                const user = (await cloudApi.getAuthenticatedUser({ additionalScopes: '' })) as AthomCloudAPI.User;
                // Get the first Homey of the logged in user
                const homey = await user.getFirstHomey();

                console.log(homey);
                // Create a session on this Homey
                const homeyApi = (await homey.authenticate() as HomeyAPI);

                setHomey(homeyApi);
            }

            fetchData();
        }
    }, [])

    useEffect(() => {
        if (homey) {
            const fetchData = async () => {
                const todos = await homey.flow.getFlows()
                setTodos(Object.values(todos).filter(e => e.triggerable));
            }
            fetchData();
        }
    }, [homey]);

    return (
        <List>
            {todos.map((todo) => (
                <List.Item title={todo.name} actions={<ActionPanel title={todo.name}>
                    <ActionPanel.Section>
                        <Action title="Run flow" onAction={async () => {
                            await homey.flow.triggerFlow({ id: todo.id });
                            await showToast({
                                title: "Flow triggered",
                                message: todo.name,
                                style: Toast.Style.Success,
                            })
                        }}></Action>
                    </ActionPanel.Section>
                </ActionPanel>} />
            ))}
        </List>
    );
}