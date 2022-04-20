import { connect, ConnectionError, enableLogging } from "@openfin/salesforce";
import { CLIFilterOptionType, CLITemplate } from "@openfin/workspace";
/**
 * Implement the integration provider for SalesForce.
 */
export class SalesForceIntegrationProvider {
    /**
     * The module is being registered.
     * @param integrationManager The manager for the integration.
     * @param integration The integration details.
     * @returns Nothing.
     */
    async register(integrationManager, integration) {
        this._integrationManager = integrationManager;
        console.log("Registering SalesForce");
        try {
            await this.openConnection(integration);
        }
        catch (err) {
            console.error("Error connecting to SalesForce", err);
        }
    }
    /**
     * The module is being deregistered.
     * @param integration The integration details.
     * @returns Nothing.
     */
    async deregister(integration) {
        await this.closeConnection();
    }
    /**
     * Get a list of the static application entries.
     * @param integration The integration details.
     * @returns The list of application entries.
     */
    async getAppSearchEntries(integration) {
        const results = [];
        if (integration?.data?.orgUrl) {
            results.push({
                actions: [{ name: "Browse", hotkey: "enter" }],
                data: {
                    providerId: SalesForceIntegrationProvider._PROVIDER_ID,
                    pageUrl: integration?.data?.orgUrl,
                    tags: [SalesForceIntegrationProvider._PROVIDER_ID]
                },
                icon: integration.icon,
                key: SalesForceIntegrationProvider._BROWSE_SEARCH_RESULT_KEY,
                template: CLITemplate.Plain,
                templateContent: undefined,
                title: "Browse Salesforce"
            });
            if (!this._salesForceConnection) {
                results.push(this.getReconnectSearchResult(integration));
            }
        }
        return results;
    }
    /**
     * An entry has been selected.
     * @param integration The integration details.
     * @param result The dispatched result.
     * @param lastResponse The last response.
     * @returns True if the item was handled.
     */
    async itemSelection(integration, result, lastResponse) {
        // if the user clicked the reconnect result, reconnect to salesforce and re-run query
        if (result.key === SalesForceIntegrationProvider._NOT_CONNECTED_SEARCH_RESULT_KEY) {
            await this.openConnection(integration);
            if (result.data?.query) {
                const results = await this.getSearchResults(integration, result.data?.query, result.data?.filters);
                if (lastResponse) {
                    lastResponse.revoke(SalesForceIntegrationProvider._NOT_CONNECTED_SEARCH_RESULT_KEY);
                    lastResponse.respond(results.results);
                }
            }
            return true;
        }
        // otherwise open the result page url in browser
        const data = result.data;
        if (data !== undefined && this._integrationManager) {
            const preload = `${this._integrationManager.rootUrl}/views/salesforce/preload.js`;
            const viewOptions = {
                url: data.pageUrl,
                fdc3InteropApi: "1.2",
                interop: {
                    currentContextGroup: "green"
                },
                customData: { buttonLabel: "Process Participant" },
                preloadScripts: [{ url: preload }],
                target: { name: "", url: "", uuid: "" }
            };
            await this._integrationManager.launchView(viewOptions);
            return true;
        }
        return false;
    }
    /**
     * Get a list of search results based on the query and filters.
     * @param integration The integration details.
     * @param query The query to search for.
     * @param filters The filters to apply.
     * @returns The list of results and new filters.
     */
    async getSearchResults(integration, query, filters) {
        if (this._salesForceConnection) {
            let searchResults;
            let selectedObjects = [];
            if (Array.isArray(filters) && filters.length > 0) {
                const objectsFilter = filters.find(x => x.id === SalesForceIntegrationProvider._OBJECTS_FILTER_ID);
                if (objectsFilter) {
                    selectedObjects = (Array.isArray(objectsFilter.options) ? objectsFilter.options : [objectsFilter.options])
                        .filter(x => Boolean(x.isSelected))
                        .map(x => (x.value === "Note" ? "ContentNote" : x.value));
                }
            }
            try {
                searchResults = await this.getApiSearchResults(query, selectedObjects);
                const results = searchResults.map(searchResult => {
                    if ("Website" in searchResult) {
                        return {
                            actions: [{ name: "View", hotkey: "enter" }],
                            label: searchResult.attributes.type,
                            key: searchResult.Id,
                            title: searchResult.Name,
                            icon: integration?.data?.iconMap.account,
                            data: {
                                providerId: SalesForceIntegrationProvider._PROVIDER_ID,
                                pageUrl: this.getObjectUrl(searchResult.Id, integration.data?.orgUrl),
                                tags: [SalesForceIntegrationProvider._PROVIDER_ID]
                            },
                            template: CLITemplate.Contact,
                            templateContent: {
                                name: searchResult.Name,
                                title: searchResult.Industry,
                                details: [
                                    [
                                        ["Phone", searchResult.Phone],
                                        ["Type", searchResult.Type],
                                        ["Website", searchResult.Website]
                                    ]
                                ]
                            }
                        };
                    }
                    else if ("Email" in searchResult) {
                        return {
                            actions: [{ name: "View", hotkey: "enter" }],
                            label: searchResult.attributes.type,
                            key: searchResult.Id,
                            title: searchResult.Name,
                            icon: integration?.data?.iconMap.contact,
                            data: {
                                providerId: SalesForceIntegrationProvider._PROVIDER_ID,
                                pageUrl: this.getObjectUrl(searchResult.Id, integration.data?.orgUrl),
                                tags: [SalesForceIntegrationProvider._PROVIDER_ID]
                            },
                            template: CLITemplate.Contact,
                            templateContent: {
                                name: searchResult.Name,
                                title: searchResult.Title,
                                useInitials: true,
                                details: [
                                    [
                                        ["Department", searchResult.Department],
                                        ["Email", searchResult.Email],
                                        ["Work #", searchResult.Phone]
                                    ]
                                ]
                            }
                        };
                    }
                    else if ("Description" in searchResult) {
                        return {
                            actions: [{ name: "View", hotkey: "enter" }],
                            label: searchResult.attributes.type,
                            key: searchResult.Id,
                            title: searchResult.Subject,
                            icon: integration?.data?.iconMap.task,
                            data: {
                                providerId: SalesForceIntegrationProvider._PROVIDER_ID,
                                pageUrl: this.getObjectUrl(searchResult.Id, integration.data?.orgUrl),
                                tags: [SalesForceIntegrationProvider._PROVIDER_ID]
                            },
                            template: "List",
                            templateContent: [
                                ["Subject", searchResult.Subject],
                                ["Comments", searchResult.Description]
                            ]
                        };
                    }
                    else if ("TextPreview" in searchResult) {
                        return {
                            actions: [{ name: "View", hotkey: "enter" }],
                            label: "Note",
                            key: searchResult.Id,
                            title: searchResult.Title,
                            icon: integration?.data?.iconMap.note,
                            data: {
                                providerId: SalesForceIntegrationProvider._PROVIDER_ID,
                                pageUrl: this.getObjectUrl(searchResult.Id, integration.data?.orgUrl),
                                tags: [SalesForceIntegrationProvider._PROVIDER_ID]
                            },
                            template: "List",
                            templateContent: [
                                ["Title", searchResult.Title],
                                ["Content", searchResult?.TextPreview]
                            ]
                        };
                    }
                    else if ("actor" in searchResult &&
                        (searchResult.type === "TextPost" || searchResult.type === "ContentPost")) {
                        return {
                            actions: [{ name: "View", hotkey: "enter" }],
                            label: "Chatter",
                            key: searchResult.id,
                            title: searchResult.actor?.displayName,
                            icon: integration?.data?.iconMap.chatter,
                            data: {
                                providerId: SalesForceIntegrationProvider._PROVIDER_ID,
                                pageUrl: this.getObjectUrl(searchResult.id, integration.data?.orgUrl),
                                tags: [SalesForceIntegrationProvider._PROVIDER_ID]
                            },
                            template: CLITemplate.Contact,
                            templateContent: {
                                name: searchResult.actor?.displayName,
                                useInitials: true,
                                details: [
                                    [
                                        ["Header", searchResult?.header?.text],
                                        ["Note", searchResult?.body?.text]
                                    ]
                                ]
                            }
                        };
                    }
                    // in this case we are only searching for accounts, contacts, tasks, content notes and chatter
                });
                const filteredResults = results.filter(Boolean);
                // eslint-disable-next-line no-confusing-arrow
                const objects = searchResults.map(result => "attributes" in result ? result.attributes.type : "Chatter");
                return {
                    results: filteredResults,
                    context: {
                        filters: this.getSearchFilters(objects.map(c => (c === "ContentNote" ? "Note" : c)))
                    }
                };
            }
            catch (err) {
                await this.closeConnection();
                if (err instanceof ConnectionError) {
                    return {
                        results: [this.getReconnectSearchResult(integration, query, filters)]
                    };
                }
                console.error("Error retrieving SalesForce search results", err);
            }
        }
        return {
            results: []
        };
    }
    /**
     * Open the connection to SaleForce.
     * @param integration The integration details.
     */
    async openConnection(integration) {
        if (integration?.data?.orgUrl && !this._salesForceConnection) {
            enableLogging();
            this._salesForceConnection = await connect(integration?.data.orgUrl, integration?.data.consumerKey, integration?.data.isSandbox);
        }
    }
    /**
     * Close the connection to SalesForce.
     */
    async closeConnection() {
        if (this._salesForceConnection) {
            try {
                await this._salesForceConnection.disconnect();
            }
            catch (err) {
                console.error("Error disconnecting SalesForce", err);
            }
            finally {
                this._salesForceConnection = undefined;
            }
        }
    }
    /**
     * Create the object url from the if and origin.
     * @param objectId The object id.
     * @param salesforceOrgOrigin The origin url.
     * @returns Then object url.
     */
    getObjectUrl(objectId, salesforceOrgOrigin) {
        if (!salesforceOrgOrigin) {
            return "";
        }
        return `${salesforceOrgOrigin}/${objectId}`;
    }
    /**
     * Get results from the API using a query.
     * @param query The query to call the API with.
     * @param selectedObjects The selected filters.
     * @returns The search result objects from the API.
     */
    async getApiSearchResults(query, selectedObjects) {
        const accountFieldSpec = "Account(Id, Industry, Name, Phone, Type, Website)";
        const contactFieldSpec = "Contact(Department, Email, Id, Name, Phone, Title)";
        const taskFieldSpec = "Task(Id, Subject, Description)";
        const contentNoteFieldSpec = "ContentNote(Id, Title, Content, TextPreview)";
        const fieldSpecMap = new Map([
            ["Account", accountFieldSpec],
            ["Contact", contactFieldSpec],
            ["Task", taskFieldSpec],
            ["ContentNote", contentNoteFieldSpec]
        ]);
        const fieldSpec = [...fieldSpecMap]
            .filter(x => {
            if (Array.isArray(selectedObjects) && selectedObjects.length > 0) {
                return selectedObjects.includes(x[0]);
            }
            return true;
        })
            .map(x => x[1])
            .join(", ");
        const batch = [];
        if (fieldSpec.length > 0) {
            const salesforceSearchQuery = `FIND {${this.escapeQuery(query)}} IN ALL FIELDS RETURNING ${fieldSpec} LIMIT 25`;
            batch.push({
                method: "GET",
                url: `/services/data/vXX.X/search?q=${encodeURIComponent(salesforceSearchQuery)}`
            });
        }
        const includeChatter = !selectedObjects?.length || selectedObjects.includes("Chatter");
        if (includeChatter) {
            batch.push({
                method: "GET",
                url: `/services/data/vXX.X/chatter/feed-elements?q=${query}&pageSize=25&sort=LastModifiedDateDesc`
            });
        }
        const batchedResults = await this.getBatchedResults(batch);
        let results = [];
        if (batchedResults.length > 0) {
            let idx = 0;
            if (fieldSpec.length > 0) {
                const searchResponse = batchedResults[idx++];
                if (searchResponse.searchRecords) {
                    results = results.concat(searchResponse.searchRecords);
                }
            }
            if (includeChatter) {
                const chatterResponse = batchedResults[idx++];
                if (chatterResponse.elements) {
                    results = results.concat(chatterResponse.elements);
                }
            }
        }
        return results;
    }
    /**
     * Get batched results from SalesForce api.
     * @param batchRequests The batch requests to send.
     * @returns The results from the batch request.
     */
    async getBatchedResults(batchRequests) {
        if (batchRequests.length === 0 || !this._salesForceConnection) {
            return [];
        }
        const batch = { batchRequests, haltOnError: false };
        const response = await this._salesForceConnection.executeApiRequest("/services/data/vXX.X/composite/batch/", "POST", batch, { "Content-Type": "application/json" });
        return response.data?.results.map(r => r.result) ?? [];
    }
    /**
     * Escape any characters needed in SalesForce API calls.
     * @param query The query to escape.
     * @returns The escaped query.
     */
    escapeQuery(query) {
        // There are some reserved characters for queries so we need to escape them
        // https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/sforce_api_calls_sosl_find.htm
        return query.replace(/[!"&'()*+:?[\\\]^{|}~-]/gm, "\\$&");
    }
    /**
     * Get the search result to display when SalesForce needs to reconnect.
     * @param integration The integration details.
     * @param query The query that needs to reconnect.
     * @param filters The filter for the reconnect.
     * @returns The search result entry.
     */
    getReconnectSearchResult(integration, query, filters) {
        return {
            actions: [{ name: "Reconnect", hotkey: "enter" }],
            key: SalesForceIntegrationProvider._NOT_CONNECTED_SEARCH_RESULT_KEY,
            icon: integration?.icon,
            title: "Reconnect to Salesforce",
            data: {
                providerId: SalesForceIntegrationProvider._PROVIDER_ID,
                query,
                filters
            }
        };
    }
    /**
     * Get the search filters based on the results.
     * @param objects The object types to create the filters from.
     * @returns The filters.
     */
    getSearchFilters(objects) {
        if (Array.isArray(objects) && objects.length > 0) {
            const filters = [];
            const uniqueObjects = [...new Set(objects.sort())];
            const objectFilter = {
                id: SalesForceIntegrationProvider._OBJECTS_FILTER_ID,
                title: "Objects",
                type: CLIFilterOptionType.MultiSelect,
                options: []
            };
            for (const object of uniqueObjects) {
                if (Array.isArray(objectFilter.options)) {
                    objectFilter.options.push({
                        value: object,
                        isSelected: false
                    });
                }
            }
            filters.push(objectFilter);
            return filters;
        }
        return [];
    }
}
/**
 * Provider id.
 * @internal
 */
SalesForceIntegrationProvider._PROVIDER_ID = "salesforce";
/**
 * The key to use for a SalesForce result.
 * @internal
 */
SalesForceIntegrationProvider._BROWSE_SEARCH_RESULT_KEY = "browse-salesforce";
/**
 * The id for the SaleForce filters.
 * @internal
 */
SalesForceIntegrationProvider._OBJECTS_FILTER_ID = "salesforce-objects";
/**
 * The id of the not connected result.
 * @internal
 */
SalesForceIntegrationProvider._NOT_CONNECTED_SEARCH_RESULT_KEY = "salesforce-not-connected-result";
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZWdyYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvaW50ZWdyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUNILE9BQU8sRUFDUCxlQUFlLEVBQ2YsYUFBYSxFQUdoQixNQUFNLHFCQUFxQixDQUFDO0FBQzdCLE9BQU8sRUFDSCxtQkFBbUIsRUFDbkIsV0FBVyxFQVVkLE1BQU0sb0JBQW9CLENBQUM7QUFnQjVCOztHQUVHO0FBQ0gsTUFBTSxPQUFPLDZCQUE2QjtJQXFDdEM7Ozs7O09BS0c7SUFDSSxLQUFLLENBQUMsUUFBUSxDQUNqQixrQkFBc0MsRUFDdEMsV0FBNEM7UUFFNUMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLGtCQUFrQixDQUFDO1FBQzlDLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUN0QyxJQUFJO1lBQ0EsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1NBQzFDO1FBQUMsT0FBTyxHQUFHLEVBQUU7WUFDVixPQUFPLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1NBQ3hEO0lBQ0wsQ0FBQztJQUVEOzs7O09BSUc7SUFDSSxLQUFLLENBQUMsVUFBVSxDQUFDLFdBQTRDO1FBQ2hFLE1BQU0sSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQ2pDLENBQUM7SUFFRDs7OztPQUlHO0lBQ0ksS0FBSyxDQUFDLG1CQUFtQixDQUFDLFdBQTRDO1FBQ3pFLE1BQU0sT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUNuQixJQUFJLFdBQVcsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFO1lBQzNCLE9BQU8sQ0FBQyxJQUFJLENBQUM7Z0JBQ1QsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQztnQkFDOUMsSUFBSSxFQUFFO29CQUNGLFVBQVUsRUFBRSw2QkFBNkIsQ0FBQyxZQUFZO29CQUN0RCxPQUFPLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxNQUFNO29CQUNsQyxJQUFJLEVBQUUsQ0FBQyw2QkFBNkIsQ0FBQyxZQUFZLENBQUM7aUJBQzdCO2dCQUN6QixJQUFJLEVBQUUsV0FBVyxDQUFDLElBQUk7Z0JBQ3RCLEdBQUcsRUFBRSw2QkFBNkIsQ0FBQyx5QkFBeUI7Z0JBQzVELFFBQVEsRUFBRSxXQUFXLENBQUMsS0FBSztnQkFDM0IsZUFBZSxFQUFFLFNBQVM7Z0JBQzFCLEtBQUssRUFBRSxtQkFBbUI7YUFDTCxDQUFDLENBQUM7WUFFM0IsSUFBSSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRTtnQkFDN0IsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQzthQUM1RDtTQUNKO1FBRUQsT0FBTyxPQUFPLENBQUM7SUFDbkIsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNJLEtBQUssQ0FBQyxhQUFhLENBQ3RCLFdBQTRDLEVBQzVDLE1BQWlDLEVBQ2pDLFlBQXdDO1FBRXhDLHFGQUFxRjtRQUNyRixJQUFJLE1BQU0sQ0FBQyxHQUFHLEtBQUssNkJBQTZCLENBQUMsZ0NBQWdDLEVBQUU7WUFDL0UsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBRXZDLElBQUksTUFBTSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUU7Z0JBQ3BCLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxNQUFNLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUNuRyxJQUFJLFlBQVksRUFBRTtvQkFDZCxZQUFZLENBQUMsTUFBTSxDQUFDLDZCQUE2QixDQUFDLGdDQUFnQyxDQUFDLENBQUM7b0JBQ3BGLFlBQVksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2lCQUN6QzthQUNKO1lBQ0QsT0FBTyxJQUFJLENBQUM7U0FDZjtRQUVELGdEQUFnRDtRQUNoRCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsSUFBNEIsQ0FBQztRQUNqRCxJQUFJLElBQUksS0FBSyxTQUFTLElBQUksSUFBSSxDQUFDLG1CQUFtQixFQUFFO1lBQ2hELE1BQU0sT0FBTyxHQUFHLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE9BQU8sOEJBQThCLENBQUM7WUFDbEYsTUFBTSxXQUFXLEdBQUc7Z0JBQ2hCLEdBQUcsRUFBRSxJQUFJLENBQUMsT0FBTztnQkFDakIsY0FBYyxFQUFFLEtBQUs7Z0JBQ3JCLE9BQU8sRUFBRTtvQkFDTCxtQkFBbUIsRUFBRSxPQUFPO2lCQUMvQjtnQkFDRCxVQUFVLEVBQUUsRUFBRSxXQUFXLEVBQUUscUJBQXFCLEVBQUU7Z0JBQ2xELGNBQWMsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxDQUFDO2dCQUNsQyxNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRTthQUMxQyxDQUFDO1lBQ0YsTUFBTSxJQUFJLENBQUMsbUJBQW1CLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ3ZELE9BQU8sSUFBSSxDQUFDO1NBQ2Y7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNqQixDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0ksS0FBSyxDQUFDLGdCQUFnQixDQUN6QixXQUE0QyxFQUM1QyxLQUFhLEVBQ2IsT0FBcUI7UUFFckIsSUFBSSxJQUFJLENBQUMscUJBQXFCLEVBQUU7WUFDNUIsSUFBSSxhQU1ELENBQUM7WUFFSixJQUFJLGVBQWUsR0FBYSxFQUFFLENBQUM7WUFDbkMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO2dCQUM5QyxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyw2QkFBNkIsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUNuRyxJQUFJLGFBQWEsRUFBRTtvQkFDZixlQUFlLEdBQUcsQ0FDZCxLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQ3pGO3lCQUNJLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUM7eUJBQ2xDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7aUJBQ2pFO2FBQ0o7WUFFRCxJQUFJO2dCQUNBLGFBQWEsR0FBRyxNQUFNLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsZUFBZSxDQUFDLENBQUM7Z0JBRXZFLE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEVBQUU7b0JBQzdDLElBQUksU0FBUyxJQUFJLFlBQVksRUFBRTt3QkFDM0IsT0FBTzs0QkFDSCxPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxDQUFDOzRCQUM1QyxLQUFLLEVBQUUsWUFBWSxDQUFDLFVBQVUsQ0FBQyxJQUFJOzRCQUNuQyxHQUFHLEVBQUUsWUFBWSxDQUFDLEVBQUU7NEJBQ3BCLEtBQUssRUFBRSxZQUFZLENBQUMsSUFBSTs0QkFDeEIsSUFBSSxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsT0FBTyxDQUFDLE9BQU87NEJBQ3hDLElBQUksRUFBRTtnQ0FDRixVQUFVLEVBQUUsNkJBQTZCLENBQUMsWUFBWTtnQ0FDdEQsT0FBTyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLEVBQUUsRUFBRSxXQUFXLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQztnQ0FDckUsSUFBSSxFQUFFLENBQUMsNkJBQTZCLENBQUMsWUFBWSxDQUFDOzZCQUNyRDs0QkFDRCxRQUFRLEVBQUUsV0FBVyxDQUFDLE9BQU87NEJBQzdCLGVBQWUsRUFBRTtnQ0FDYixJQUFJLEVBQUUsWUFBWSxDQUFDLElBQUk7Z0NBQ3ZCLEtBQUssRUFBRSxZQUFZLENBQUMsUUFBUTtnQ0FDNUIsT0FBTyxFQUFFO29DQUNMO3dDQUNJLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyxLQUFLLENBQUM7d0NBQzdCLENBQUMsTUFBTSxFQUFFLFlBQVksQ0FBQyxJQUFJLENBQUM7d0NBQzNCLENBQUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxPQUFPLENBQUM7cUNBQ3BDO2lDQUNKOzZCQUNKO3lCQUNzQixDQUFDO3FCQUMvQjt5QkFBTSxJQUFJLE9BQU8sSUFBSSxZQUFZLEVBQUU7d0JBQ2hDLE9BQU87NEJBQ0gsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQzs0QkFDNUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxVQUFVLENBQUMsSUFBSTs0QkFDbkMsR0FBRyxFQUFFLFlBQVksQ0FBQyxFQUFFOzRCQUNwQixLQUFLLEVBQUUsWUFBWSxDQUFDLElBQUk7NEJBQ3hCLElBQUksRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPOzRCQUN4QyxJQUFJLEVBQUU7Z0NBQ0YsVUFBVSxFQUFFLDZCQUE2QixDQUFDLFlBQVk7Z0NBQ3RELE9BQU8sRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxFQUFFLEVBQUUsV0FBVyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUM7Z0NBQ3JFLElBQUksRUFBRSxDQUFDLDZCQUE2QixDQUFDLFlBQVksQ0FBQzs2QkFDckQ7NEJBQ0QsUUFBUSxFQUFFLFdBQVcsQ0FBQyxPQUFPOzRCQUM3QixlQUFlLEVBQUU7Z0NBQ2IsSUFBSSxFQUFFLFlBQVksQ0FBQyxJQUFJO2dDQUN2QixLQUFLLEVBQUUsWUFBWSxDQUFDLEtBQUs7Z0NBQ3pCLFdBQVcsRUFBRSxJQUFJO2dDQUNqQixPQUFPLEVBQUU7b0NBQ0w7d0NBQ0ksQ0FBQyxZQUFZLEVBQUUsWUFBWSxDQUFDLFVBQVUsQ0FBQzt3Q0FDdkMsQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLEtBQUssQ0FBQzt3Q0FDN0IsQ0FBQyxRQUFRLEVBQUUsWUFBWSxDQUFDLEtBQUssQ0FBQztxQ0FDakM7aUNBQ0o7NkJBQ0o7eUJBQ3NCLENBQUM7cUJBQy9CO3lCQUFNLElBQUksYUFBYSxJQUFJLFlBQVksRUFBRTt3QkFDdEMsT0FBTzs0QkFDSCxPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxDQUFDOzRCQUM1QyxLQUFLLEVBQUUsWUFBWSxDQUFDLFVBQVUsQ0FBQyxJQUFJOzRCQUNuQyxHQUFHLEVBQUUsWUFBWSxDQUFDLEVBQUU7NEJBQ3BCLEtBQUssRUFBRSxZQUFZLENBQUMsT0FBTzs0QkFDM0IsSUFBSSxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUk7NEJBQ3JDLElBQUksRUFBRTtnQ0FDRixVQUFVLEVBQUUsNkJBQTZCLENBQUMsWUFBWTtnQ0FDdEQsT0FBTyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLEVBQUUsRUFBRSxXQUFXLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQztnQ0FDckUsSUFBSSxFQUFFLENBQUMsNkJBQTZCLENBQUMsWUFBWSxDQUFDOzZCQUNyRDs0QkFDRCxRQUFRLEVBQUUsTUFBTTs0QkFDaEIsZUFBZSxFQUFFO2dDQUNiLENBQUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxPQUFPLENBQUM7Z0NBQ2pDLENBQUMsVUFBVSxFQUFFLFlBQVksQ0FBQyxXQUFXLENBQUM7NkJBQ3pDO3lCQUNtQixDQUFDO3FCQUM1Qjt5QkFBTSxJQUFJLGFBQWEsSUFBSSxZQUFZLEVBQUU7d0JBQ3RDLE9BQU87NEJBQ0gsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQzs0QkFDNUMsS0FBSyxFQUFFLE1BQU07NEJBQ2IsR0FBRyxFQUFFLFlBQVksQ0FBQyxFQUFFOzRCQUNwQixLQUFLLEVBQUUsWUFBWSxDQUFDLEtBQUs7NEJBQ3pCLElBQUksRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJOzRCQUNyQyxJQUFJLEVBQUU7Z0NBQ0YsVUFBVSxFQUFFLDZCQUE2QixDQUFDLFlBQVk7Z0NBQ3RELE9BQU8sRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxFQUFFLEVBQUUsV0FBVyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUM7Z0NBQ3JFLElBQUksRUFBRSxDQUFDLDZCQUE2QixDQUFDLFlBQVksQ0FBQzs2QkFDckQ7NEJBQ0QsUUFBUSxFQUFFLE1BQU07NEJBQ2hCLGVBQWUsRUFBRTtnQ0FDYixDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUMsS0FBSyxDQUFDO2dDQUM3QixDQUFDLFNBQVMsRUFBRSxZQUFZLEVBQUUsV0FBVyxDQUFDOzZCQUN6Qzt5QkFDbUIsQ0FBQztxQkFDNUI7eUJBQU0sSUFDSCxPQUFPLElBQUksWUFBWTt3QkFDdkIsQ0FBQyxZQUFZLENBQUMsSUFBSSxLQUFLLFVBQVUsSUFBSSxZQUFZLENBQUMsSUFBSSxLQUFLLGFBQWEsQ0FBQyxFQUMzRTt3QkFDRSxPQUFPOzRCQUNILE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUM7NEJBQzVDLEtBQUssRUFBRSxTQUFTOzRCQUNoQixHQUFHLEVBQUUsWUFBWSxDQUFDLEVBQUU7NEJBQ3BCLEtBQUssRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFdBQVc7NEJBQ3RDLElBQUksRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPOzRCQUN4QyxJQUFJLEVBQUU7Z0NBQ0YsVUFBVSxFQUFFLDZCQUE2QixDQUFDLFlBQVk7Z0NBQ3RELE9BQU8sRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxFQUFFLEVBQUUsV0FBVyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUM7Z0NBQ3JFLElBQUksRUFBRSxDQUFDLDZCQUE2QixDQUFDLFlBQVksQ0FBQzs2QkFDN0I7NEJBQ3pCLFFBQVEsRUFBRSxXQUFXLENBQUMsT0FBTzs0QkFDN0IsZUFBZSxFQUFFO2dDQUNiLElBQUksRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFdBQVc7Z0NBQ3JDLFdBQVcsRUFBRSxJQUFJO2dDQUNqQixPQUFPLEVBQUU7b0NBQ0w7d0NBQ0ksQ0FBQyxRQUFRLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUM7d0NBQ3RDLENBQUMsTUFBTSxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO3FDQUNyQztpQ0FDSjs2QkFDSjt5QkFDc0IsQ0FBQztxQkFDL0I7b0JBQ0QsOEZBQThGO2dCQUNsRyxDQUFDLENBQUMsQ0FBQztnQkFFSCxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBNkIsQ0FBQztnQkFDNUUsOENBQThDO2dCQUM5QyxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQ3ZDLFlBQVksSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQzlELENBQUM7Z0JBRUYsT0FBTztvQkFDSCxPQUFPLEVBQUUsZUFBZTtvQkFDeEIsT0FBTyxFQUFFO3dCQUNMLE9BQU8sRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLGFBQWEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3FCQUN2RjtpQkFDSixDQUFDO2FBQ0w7WUFBQyxPQUFPLEdBQUcsRUFBRTtnQkFDVixNQUFNLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDN0IsSUFBSSxHQUFHLFlBQVksZUFBZSxFQUFFO29CQUNoQyxPQUFPO3dCQUNILE9BQU8sRUFBRSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxXQUFXLEVBQUUsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO3FCQUN4RSxDQUFDO2lCQUNMO2dCQUNELE9BQU8sQ0FBQyxLQUFLLENBQUMsNENBQTRDLEVBQUUsR0FBRyxDQUFDLENBQUM7YUFDcEU7U0FDSjtRQUVELE9BQU87WUFDSCxPQUFPLEVBQUUsRUFBRTtTQUNkLENBQUM7SUFDTixDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssS0FBSyxDQUFDLGNBQWMsQ0FBQyxXQUE0QztRQUNyRSxJQUFJLFdBQVcsRUFBRSxJQUFJLEVBQUUsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFO1lBQzFELGFBQWEsRUFBRSxDQUFDO1lBQ2hCLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxNQUFNLE9BQU8sQ0FDdEMsV0FBVyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQ3hCLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVyxFQUM3QixXQUFXLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FDOUIsQ0FBQztTQUNMO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0ssS0FBSyxDQUFDLGVBQWU7UUFDekIsSUFBSSxJQUFJLENBQUMscUJBQXFCLEVBQUU7WUFDNUIsSUFBSTtnQkFDQSxNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxVQUFVLEVBQUUsQ0FBQzthQUNqRDtZQUFDLE9BQU8sR0FBRyxFQUFFO2dCQUNWLE9BQU8sQ0FBQyxLQUFLLENBQUMsZ0NBQWdDLEVBQUUsR0FBRyxDQUFDLENBQUM7YUFDeEQ7b0JBQVM7Z0JBQ04sSUFBSSxDQUFDLHFCQUFxQixHQUFHLFNBQVMsQ0FBQzthQUMxQztTQUNKO0lBQ0wsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0ssWUFBWSxDQUFDLFFBQWdCLEVBQUUsbUJBQTRCO1FBQy9ELElBQUksQ0FBQyxtQkFBbUIsRUFBRTtZQUN0QixPQUFPLEVBQUUsQ0FBQztTQUNiO1FBQ0QsT0FBTyxHQUFHLG1CQUFtQixJQUFJLFFBQVEsRUFBRSxDQUFDO0lBQ2hELENBQUM7SUFFRDs7Ozs7T0FLRztJQUNLLEtBQUssQ0FBQyxtQkFBbUIsQ0FDN0IsS0FBYSxFQUNiLGVBQTBCO1FBSTFCLE1BQU0sZ0JBQWdCLEdBQUcsbURBQW1ELENBQUM7UUFDN0UsTUFBTSxnQkFBZ0IsR0FBRyxvREFBb0QsQ0FBQztRQUM5RSxNQUFNLGFBQWEsR0FBRyxnQ0FBZ0MsQ0FBQztRQUN2RCxNQUFNLG9CQUFvQixHQUFHLDhDQUE4QyxDQUFDO1FBQzVFLE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxDQUFpQjtZQUN6QyxDQUFDLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQztZQUM3QixDQUFDLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQztZQUM3QixDQUFDLE1BQU0sRUFBRSxhQUFhLENBQUM7WUFDdkIsQ0FBQyxhQUFhLEVBQUUsb0JBQW9CLENBQUM7U0FDeEMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxTQUFTLEdBQUcsQ0FBQyxHQUFHLFlBQVksQ0FBQzthQUM5QixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDUixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLElBQUksZUFBZSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7Z0JBQzlELE9BQU8sZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUN6QztZQUNELE9BQU8sSUFBSSxDQUFDO1FBQ2hCLENBQUMsQ0FBQzthQUNELEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUNkLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVoQixNQUFNLEtBQUssR0FBaUMsRUFBRSxDQUFDO1FBRS9DLElBQUksU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDdEIsTUFBTSxxQkFBcUIsR0FBRyxTQUFTLElBQUksQ0FBQyxXQUFXLENBQ25ELEtBQUssQ0FDUiw2QkFBNkIsU0FBUyxXQUFXLENBQUM7WUFFbkQsS0FBSyxDQUFDLElBQUksQ0FBQztnQkFDUCxNQUFNLEVBQUUsS0FBSztnQkFDYixHQUFHLEVBQUUsaUNBQWlDLGtCQUFrQixDQUFDLHFCQUFxQixDQUFDLEVBQUU7YUFDcEYsQ0FBQyxDQUFDO1NBQ047UUFFRCxNQUFNLGNBQWMsR0FBRyxDQUFDLGVBQWUsRUFBRSxNQUFNLElBQUksZUFBZSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN2RixJQUFJLGNBQWMsRUFBRTtZQUNoQixLQUFLLENBQUMsSUFBSSxDQUFDO2dCQUNQLE1BQU0sRUFBRSxLQUFLO2dCQUNiLEdBQUcsRUFBRSxnREFBZ0QsS0FBSyx3Q0FBd0M7YUFDckcsQ0FBQyxDQUFDO1NBQ047UUFFRCxNQUFNLGNBQWMsR0FBRyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FLakQsS0FBSyxDQUFDLENBQUM7UUFFVCxJQUFJLE9BQU8sR0FNTCxFQUFFLENBQUM7UUFFVCxJQUFJLGNBQWMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1lBQzNCLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztZQUNaLElBQUksU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7Z0JBQ3RCLE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQyxHQUFHLEVBQUUsQ0FFMUMsQ0FBQztnQkFDRixJQUFJLGNBQWMsQ0FBQyxhQUFhLEVBQUU7b0JBQzlCLE9BQU8sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQztpQkFDMUQ7YUFDSjtZQUVELElBQUksY0FBYyxFQUFFO2dCQUNoQixNQUFNLGVBQWUsR0FBRyxjQUFjLENBQUMsR0FBRyxFQUFFLENBQThCLENBQUM7Z0JBQzNFLElBQUksZUFBZSxDQUFDLFFBQVEsRUFBRTtvQkFDMUIsT0FBTyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2lCQUN0RDthQUNKO1NBQ0o7UUFFRCxPQUFPLE9BQU8sQ0FBQztJQUNuQixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNLLEtBQUssQ0FBQyxpQkFBaUIsQ0FBSSxhQUEyQztRQUMxRSxJQUFJLGFBQWEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFO1lBQzNELE9BQU8sRUFBRSxDQUFDO1NBQ2I7UUFDRCxNQUFNLEtBQUssR0FBMkIsRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxDQUFDO1FBRTVFLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixDQUMvRCx1Q0FBdUMsRUFDdkMsTUFBTSxFQUNOLEtBQUssRUFDTCxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxDQUN6QyxDQUFDO1FBRUYsT0FBTyxRQUFRLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBVyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2hFLENBQUM7SUFFRDs7OztPQUlHO0lBQ0ssV0FBVyxDQUFDLEtBQWE7UUFDN0IsMkVBQTJFO1FBQzNFLDRHQUE0RztRQUM1RyxPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUMsMkJBQTJCLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNLLHdCQUF3QixDQUM1QixXQUE0QyxFQUM1QyxLQUFjLEVBQ2QsT0FBcUI7UUFFckIsT0FBTztZQUNILE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUM7WUFDakQsR0FBRyxFQUFFLDZCQUE2QixDQUFDLGdDQUFnQztZQUNuRSxJQUFJLEVBQUUsV0FBVyxFQUFFLElBQUk7WUFDdkIsS0FBSyxFQUFFLHlCQUF5QjtZQUNoQyxJQUFJLEVBQUU7Z0JBQ0YsVUFBVSxFQUFFLDZCQUE2QixDQUFDLFlBQVk7Z0JBQ3RELEtBQUs7Z0JBQ0wsT0FBTzthQUNWO1NBQ3lCLENBQUM7SUFDbkMsQ0FBQztJQUVEOzs7O09BSUc7SUFDSyxnQkFBZ0IsQ0FBQyxPQUFpQjtRQUN0QyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDOUMsTUFBTSxPQUFPLEdBQWdCLEVBQUUsQ0FBQztZQUNoQyxNQUFNLGFBQWEsR0FBRyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNuRCxNQUFNLFlBQVksR0FBYztnQkFDNUIsRUFBRSxFQUFFLDZCQUE2QixDQUFDLGtCQUFrQjtnQkFDcEQsS0FBSyxFQUFFLFNBQVM7Z0JBQ2hCLElBQUksRUFBRSxtQkFBbUIsQ0FBQyxXQUFXO2dCQUNyQyxPQUFPLEVBQUUsRUFBRTthQUNkLENBQUM7WUFFRixLQUFLLE1BQU0sTUFBTSxJQUFJLGFBQWEsRUFBRTtnQkFDaEMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsRUFBRTtvQkFDckMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7d0JBQ3RCLEtBQUssRUFBRSxNQUFNO3dCQUNiLFVBQVUsRUFBRSxLQUFLO3FCQUNwQixDQUFDLENBQUM7aUJBQ047YUFDSjtZQUVELE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDM0IsT0FBTyxPQUFPLENBQUM7U0FDbEI7UUFDRCxPQUFPLEVBQUUsQ0FBQztJQUNkLENBQUM7O0FBOWhCRDs7O0dBR0c7QUFDcUIsMENBQVksR0FBRyxZQUFZLENBQUM7QUFFcEQ7OztHQUdHO0FBQ3FCLHVEQUF5QixHQUFHLG1CQUFtQixDQUFDO0FBRXhFOzs7R0FHRztBQUNxQixnREFBa0IsR0FBRyxvQkFBb0IsQ0FBQztBQUVsRTs7O0dBR0c7QUFDcUIsOERBQWdDLEdBQUcsaUNBQWlDLENBQUMifQ==