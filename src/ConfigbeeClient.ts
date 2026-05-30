import Config from "./Config";
import { SDK_VERSION } from "./version";
import { isInPercentageBucket } from "./utils/percentageBucketing";

declare var localStorage: any;
declare var global: any;
declare var navigator: any;
declare var EventSource: any;
declare var window: any;

const wait = (ms: number): Promise<void> => new Promise(res => setTimeout(res, ms));

const fetchRetry = (url: string, delay: number, tries: number, fetchOptions: RequestInit = {}): Promise<Response> => {
    function onError(err){
        let triesLeft = tries - 1;
        if(!triesLeft){
            throw err;
        }
        return wait(delay).then(() => fetchRetry(url, delay, triesLeft, fetchOptions));
    }
    return fetch(url,fetchOptions).catch(onError);
}

const ENV_DEFAULT_CONFIG_GROUP_DIST_OBJ_KEY_REGEX = /^p-([0-9A-Fa-f]{4,64})\/e-([0-9A-Fa-f]{4,64})\/cg-default$/

class EventEmitter {
  private callbacks: {[key: string]: ((data?: any) => void)[]};
  constructor() {
    this.callbacks = {};
  }

  on(event: string, cb: (data?: any) => void): void {
    if (!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(cb);
  }

  emit(event: string, data: any = undefined): void {
    const cbs = this.callbacks[event];
    if (cbs) {
      cbs.forEach(cb => cb(data));
    }
  }
}

const getStorage = () =>{
    if (typeof localStorage === 'undefined'){
        if(global.localStorage === undefined){
            global.localStorageMap = new Map<string,string>()
            global.localStorage = {
                getItem:function(key){return global.localStorageMap.get(key)},
                setItem:function(key,value){global.localStorageMap.set(key,value)},
                removeItem:function(key){global.localStorageMap.delete(key)},
                length: undefined,
                clear: undefined,
                key: undefined,
            }
        }
        return global.localStorage
    }
    return localStorage
}


const getSSEventSource = (url: string) => {
    let LocalEventSource
    if(typeof EventSource === 'undefined'){
        LocalEventSource = require('event-source-polyfill').EventSourcePolyfill
    }
    else{
        LocalEventSource = EventSource
    }
    return new LocalEventSource(url)
}

const generateVisitorId = () => {
    const timestamp = Date.now().toString(36);
    let randomString: string;
    try {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        const randomArray = new Uint8Array(32);
        const c = (typeof window !== 'undefined' && window.crypto) ? window.crypto : require('crypto');
        c.getRandomValues(randomArray);
        randomString = Array.from(randomArray).map((n: number) => chars[n % chars.length]).join('');
    } catch {
        randomString = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
    }
    return `${timestamp}-${randomString}`;
}

const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
})


const getVisitorId = (clientKey: string, objKey: string) => {
    const storage = getStorage();
    return storage.getItem("__configbee::" + clientKey + "::VisitorId::" + objKey);
}

const setVisitorId = (clientKey: string, objKey: string, visitorId: string) => {
    const storage = getStorage();
    storage.setItem("__configbee::" + clientKey + "::VisitorId::" + objKey, visitorId);
}

const getOrCreateVisitorId = (clientKey: string, objKey: string) => {
    let visitorId = getVisitorId(clientKey, objKey);
    if (!visitorId) {
        visitorId = generateVisitorId();
        setVisitorId(clientKey, objKey, visitorId);
    }
    return visitorId;
}


const getDistObjectCurrentVersionId = (clientKey:string, objKey:string) => {
    const storage = getStorage()
    const storageKey = "__configbee::"+clientKey+"::CurrentVersionId::"+objKey
    return storage.getItem(storageKey)
}
const setDistObjectCurrentVersionId = (clientKey:string, objKey:string, versionId:string) => {
    const storage = getStorage()
    const storageKey = "__configbee::"+clientKey+"::CurrentVersionId::"+objKey
    storage.setItem(storageKey, versionId)
}

const getActiveSessionData = (clientKey:string, objKey:string) => {
    const storage = getStorage()
    const storageKey = "__configbee::"+clientKey+"::ActiveSession::"+objKey
    const storedString = storage.getItem(storageKey)
    if(!storedString){
        return undefined
    }
    return JSON.parse(storedString) as {"key":string, "versionHash":string}
}

const setActiveSessionData = (clientKey:string, objKey:string, sessionData:{"key":string, "versionHash":string}) => {
    const storage = getStorage()
    const storageKey = "__configbee::"+clientKey+"::ActiveSession::"+objKey
    storage.setItem(storageKey, JSON.stringify(sessionData))
}
const clearActiveSessionData = (clientKey:string, objKey:string) => {
    const storage = getStorage()
    const storageKey = "__configbee::"+clientKey+"::ActiveSession::"+objKey
    storage.removeItem(storageKey)
}

const getFetchOptions = (source,sourceOptions:{fetchSource:"cdn-cached"|"static-store"|"direct",versioned:boolean}=undefined) => {
    const fetchOptions:{cache?:"no-store"|"force-cache"|"no-cache"|"default"} = {}
    switch(source.type){
        case "http-fetch":
            if(source.cacheMode=="full"){
                fetchOptions.cache = "force-cache"
            }
            else if(source.cacheMode=="none"){
                fetchOptions.cache = "no-store"
            }
            break
        case "sse":
            if(sourceOptions?.fetchSource=="cdn-cached" && sourceOptions?.versioned){
                fetchOptions.cache = "force-cache"
            }
            break
        default:
            throw Error("Unknown source type: "+source.type)
    }
    
    if(fetchOptions.cache === undefined){
        fetchOptions.cache = "default"
    }
    return fetchOptions
}

export namespace ConfigbeeClient {
    export type CbStatusType = "INITIALIZING"|"ACTIVE"|"DEACTIVE"|"ERROR"
    export type CbFlagType = boolean | null | undefined
    export type CbFlagsType = {[key: string]: CbFlagType}
    export type CbNumberType = number | null | undefined
    export type CbNumbersType = {[key: string]: CbNumberType}
    export type CbTextType = string | null | undefined
    export type CbTextsType = {[key: string]: CbTextType}
    export type CbJsonType = {[key: string]:any} | null | undefined
    export type CbJsonsType = {[key: string]: CbJsonType}

    export type CbError = {type: "TARGET_PROPERTIES_MISMATCH", message?: string}

    interface StringProperties {
        [key: string]: string
    }

    interface OfflineSource {
        type: "offline",
        data: any
    }
    interface HttpFetchSource {
        type: "http-fetch",
        baseUrl: string,
        cacheMode: "none"|"full"|"default",
        enablePolling?: boolean,
        pollingDelay?: number,
        useVersionedUrl?: boolean
    }
    interface SSESource {
        type: "sse",
        eventsBaseUrl: string,
        fetchBaseUrls: {cdnCached: string, staticStore: string, direct: string}
        fallbackSources?: string[]
    }

    interface FlagOptionData{
        optionType: "FLAG",
        flagValue: CbFlagType
    }
    interface NumberOptionData{
        optionType: "NUMBER",
        numberValue: CbNumberType
    }
    interface TextOptionData{
        optionType: "TEXT",
        textValue: CbTextType
    }
    interface JsonOptionData{
        optionType: "JSON",
        jsonValue: CbJsonType
    }
    interface DistributionObjContent {
        [key: string]: FlagOptionData | NumberOptionData | TextOptionData | JsonOptionData
    }
    interface ContextAssignment { key: string, value: string }
    interface PercentageHashModifier {
        type: "PERCENTAGE_HASH"
        args: { percentage: number, hashInput: "VISITOR"|"ASSIGNMENT"|(string & {}) /* (string & {}) prevents union collapse, preserving IDE autocomplete for known values */, assignmentKey?: string, salt?: string }
        content?: DistributionObjContent
    }
    interface AssignmentMatchModifier {
        type: "ASSIGNMENT_MATCH"
        args: { "key"?: string, "value"?: string, "key-in"?: string[], "value-in"?: string[] }
        content?: DistributionObjContent
    }
    interface MatchAnyModifier {
        type: "MATCH_ANY"
        conditions: ContentModifier[]
        content?: DistributionObjContent
    }
    interface MatchAllModifier {
        type: "MATCH_ALL"
        conditions: ContentModifier[]
        content?: DistributionObjContent
    }
    type ContentModifier = PercentageHashModifier | AssignmentMatchModifier | MatchAnyModifier | MatchAllModifier | { type: string, args?: any, conditions?: any[], content?: DistributionObjContent }
    interface ContentModifiers {
        keys: string[]
        data: { [key: string]: ContentModifier }
    }
    interface DistributionObjData {
        key?: string
        meta: {
            versionId: string
            versionTs: string
        }
        content: DistributionObjContent
        contentModifiers?: ContentModifiers
    }

    function combineDistributionObjContent({base, extras}:{base:DistributionObjContent, extras:DistributionObjContent[]}):DistributionObjContent{
        const combined:DistributionObjContent = JSON.parse(JSON.stringify(base))
        for(const each of extras){
            for(const [key, value] of Object.entries(each)){
                let hasValue = false
                switch(value.optionType){
                    case "FLAG":
                        if(value?.flagValue != undefined || value?.flagValue != null){
                            hasValue = true
                        }
                        break
                    case "NUMBER":
                        if(value?.numberValue != undefined || value?.numberValue != null){
                            hasValue = true
                        }
                        break
                    case "TEXT":
                        if(value?.textValue != undefined || value?.textValue != null){
                            hasValue = true
                        }
                        break
                    case "JSON":
                        if(value?.jsonValue != undefined || value?.jsonValue != null){
                            hasValue = true
                        }
                        break
                    default:
                        throw new Error("Invalid optionType:"+(value as any)?.optionType)
                }
                if(hasValue && combined[key] != undefined){
                    combined[key] = value
                }
            }
        }
    return combined
    }


    function evaluateModifier(modifier: ContentModifier, visitorId: string, contextAssignments: ContextAssignment[]): boolean {
        switch(modifier.type){
            case "PERCENTAGE_HASH": {
                const args = (modifier as PercentageHashModifier).args
                let input: string | undefined
                if(args.hashInput === "VISITOR") input = visitorId
                else if(args.hashInput === "ASSIGNMENT") input = contextAssignments.find(a => a.key === args.assignmentKey)?.value
                else { console.warn("ConfigBee: unknown hashInput:", args.hashInput); return false }
                if(input == null) return false
                return isInPercentageBucket(input, args.percentage, args.salt)
            }
            case "ASSIGNMENT_MATCH": {
                const args = (modifier as AssignmentMatchModifier).args
                if(args["key"] != null && !contextAssignments.find(a => a.key === args["key"])) return false
                if(args["value"] != null && contextAssignments.find(a => a.key === args["key"])?.value !== args["value"]) return false
                if(args["key-in"] != null && !contextAssignments.some(a => args["key-in"].includes(a.key))) return false
                if(args["value-in"] != null && !args["value-in"].includes(contextAssignments.find(a => a.key === args["key"])?.value)) return false
                return true
            }
            case "MATCH_ANY":
                return (modifier as MatchAnyModifier).conditions.some(c => evaluateModifier(c, visitorId, contextAssignments))
            case "MATCH_ALL":
                return (modifier as MatchAllModifier).conditions.every(c => evaluateModifier(c, visitorId, contextAssignments))
            default:
                console.warn("ConfigBee: unknown modifier type:", modifier.type)
                return false
        }
    }

    export interface ClientParams{
        accountId?: string
        projectId?: string
        environmentId?: string
        configGroupKey?: string

        targetProperties?: StringProperties | null
        
        key?: string

        sources?: {[key:string]:OfflineSource|HttpFetchSource|SSESource}

        onReady?: Function
        onUpdate?: Function
        subSdkName?: string
        subSdkVersion?: string
    }

    export class Client{
        private params: ClientParams
        private envKey: string
        private distributionObjKey: string
        private defaultGroupObjKey: string

        private currentTargetProperties: StringProperties
        private currentConfigGroupsData: {"default"?: DistributionObjData} = {}
        private currentTargetingData: {"default"?: {
            distributionKeys: string[],
            distributionData: {[key: string]:DistributionObjData}
        }} = {}

        private _previousSessionKey: string | undefined //set while reiniting and cleared when session create/close


        private _notifiedData: {currentSessionConfigGroupsData?: object, currentSessionTargetingData?: object} = {}

        private _status: CbStatusType

        private _sessionStatus: CbStatusType

        private readyNotificationPending: boolean = true
        private _lastTracedServingVersion: string = undefined
        private _lastTracedSessionVersionHash: string = undefined

        private eventBus = new EventEmitter()


        //to clear and retry on setTargetProperties
        private _sseEventSource: any
        private _sseSource: SSESource
        private _sseKey: string
        private _visitorId: string
        private _directBaseUrl: string
        private _contextAssignments: {key:string, value:string}[] = []

        public get status(){
            return this._status
        }

        private set status(value){
            this._status = value
            this.eventBus.emit('status_updated')
        }

        public get sessionStatus(){
            return this._sessionStatus
        }

        private set sessionStatus(value){
            this._sessionStatus = value
            this.eventBus.emit('session_status_updated')
        }

        public get targetingStatus(){
            return this._sessionStatus
        }

        private _targetProperties: StringProperties | null
        public setTargetProperties(value:StringProperties | null){
            const that = this;
            (async function() {
            await that.waitToLoadTargeting()
            that._targetProperties = value
            if(JSON.stringify(that.currentTargetProperties)!=JSON.stringify(value)){
                that.reinitSession()
            }
            })();
        }
        public unsetTargetProperties(){
            this.setTargetProperties(null)
        }

        private isSessionRequired():boolean{
            if(this._targetProperties === null){
                return false
            }
            if(this._targetProperties === undefined){
                const sessionData = getActiveSessionData(this.params.key, this.envKey)
                if(sessionData?.key == undefined){
                    return false
                }
            }
            return true
        }
        private isSessionActive():boolean{
            return this.sessionStatus == "ACTIVE"
        }
        private async createSession({baseUrl}){
            const existingSessionData = getActiveSessionData(this.params.key, this.envKey)
            const csUrl = baseUrl+"a-"+this.params.accountId+"/p-"+this.params.projectId+"/e-"+this.params.environmentId+"/cs"
            const csBody = {
                previousSessionKey: this._previousSessionKey || existingSessionData?.key,
                targetProperties: this._targetProperties
            }
            const headers = {
                'Content-Type': 'application/json'
              }
            const resBody = await (await fetch(csUrl,{method:"POST",headers,body:JSON.stringify(csBody)})).json() as any
            if(!resBody.key){
                throw Error("Unable to create ConfigBee session")
            }
            const sessionData = {"key": resBody.key as string, "versionHash": resBody.versionHash as string}
            setActiveSessionData(this.params.key, this.envKey, sessionData)
            this.handleSessionData(resBody)
            this._previousSessionKey = undefined
            await this.precacheSession({baseUrl})
        }

        private async refreshSession({baseUrl}){
            const sessionData = getActiveSessionData(this.params.key, this.envKey)
            const csUrl = baseUrl+this.envKey+"/cs-"+sessionData.key+".json"
            
            const res = await fetchRetry(csUrl, 50, 2)
            if(res.status===404){
                await this.createSession({baseUrl})
                return
            }
            const resBody = await (res).json() as any
            if(!resBody.configGroups){
                throw Error("Unable to activate session")
            }
            const sessionDataNew = {"key": sessionData.key, "versionHash": resBody.versionHash as string}
            setActiveSessionData(this.params.key, this.envKey, sessionDataNew)
            try{
                this.handleSessionData(resBody)
            }
            catch(e){
                if((e as CbError).type === "TARGET_PROPERTIES_MISMATCH"){
                    await this.createSession({baseUrl})
                    return
                }
                else{
                    console.error(e)
                }
            }
            await this.precacheSession({baseUrl})
        }

        private async tryPreviousSessionClose({baseUrl}){
            const sessionData = getActiveSessionData(this.params.key, this.envKey)

            const previousSessionKey = this._previousSessionKey || sessionData?.key
            if(!previousSessionKey){
                return
            }
            const headers = {
                'Content-Type': 'application/json'
              }
            const csCloseUrl = baseUrl+"a-"+this.params.accountId+"/p-"+this.params.projectId+"/e-"+this.params.environmentId+"/cs-"+previousSessionKey+".close"
            await fetch(csCloseUrl,{method:"POST",headers})
            this._previousSessionKey = undefined
            clearActiveSessionData(this.params.key, this.envKey)
        }

        private async ensureSession({baseUrl}){
            if(this.sessionStatus == "DEACTIVE"){
                this.sessionStatus = "INITIALIZING"
            }
            const sessionData = getActiveSessionData(this.params.key, this.envKey)
            if(!sessionData){
                await this.createSession({baseUrl})
                return
            }
            if(this.currentTargetingData.default != undefined){
                return
            }

            const csVesrionUrl = baseUrl+this.envKey+"/cs-"+sessionData.key+"--vh-"+sessionData.versionHash+".json"
            
            const res = await fetchRetry(csVesrionUrl, 50, 2)
            if(res.status === 404){
                await this.refreshSession({baseUrl})
                return
            }
            
            const resBody = await (res).json() as any
            if(!resBody.configGroups){
                throw Error("Unable to activate session")
            }
            try{
                this.handleSessionData(resBody)
            }
            catch(e){
                if((e as CbError).type === "TARGET_PROPERTIES_MISMATCH"){
                    await this.createSession({baseUrl})
                    return
                }
                else{
                    console.error(e)
                }
            }
        }

        private handleSessionData(resBody){
            if(this._targetProperties === undefined){ //for first time while restoring session from cache
                this._targetProperties = resBody.targetProperties
            }

            if(JSON.stringify(this._targetProperties)!=JSON.stringify(resBody.targetProperties)){
                throw {"type":"TARGET_PROPERTIES_MISMATCH"} as CbError
            }
            
            this.currentTargetProperties = resBody.targetProperties
            this._contextAssignments = resBody.contextAssignments || []
            
            this.handleConfigGroupsData(resBody.configGroups)
            this.handleTargetingData(resBody.targetingData)
            this.handleStatusUpdate()
            this.notifyConfigUpdate()
        }

        
        private handleConfigGroupsData(data:{"default": DistributionObjData}){
            this.handleDistributionObj(data.default)
        }

        private handleTargetingData(data:{"default": {
            distributionKeys: string[],
            distributionData: {[key: string]:DistributionObjData}
        }}){
            if(this.currentTargetingData.default === undefined){
                this.currentTargetingData.default = {distributionData:{},distributionKeys: undefined}
            }
            this.currentTargetingData.default.distributionKeys = data.default.distributionKeys
            for(const key in data.default.distributionData){
                this.handleDistributionObj(data.default.distributionData[key],{skipHandleUpdates:true})
            }
            this.handleStatusUpdate()
            this.notifyConfigUpdate()
        }

        private notifyConfigUpdate(){
            const notifyData = {
                status: this.status,
                sessionStatus: this.sessionStatus,
                currentSessionConfigGroupsData: this.currentConfigGroupsData,
                currentSessionTargetingData: this.currentTargetingData
            }
            if(JSON.stringify(notifyData)==JSON.stringify(this._notifiedData)){
                return
            }
            if(this.readyNotificationPending){
                this.readyNotificationPending = false
                if(this.params.onReady!==undefined){
                    try{
                        this.params.onReady()
                    }
                    catch (e){
                        console.error(e)
                    }
                }
                const _readyServingVersion = this.getCurrentVersionId() as string
                const _readySessionVersionHash = getActiveSessionData(this.params.key,this.envKey)?.versionHash
                this._lastTracedServingVersion = _readyServingVersion
                this._lastTracedSessionVersionHash = _readySessionVersionHash
                this.sendTrace([{clientSideId:generateUUID(),clientSideTsMs:Date.now(),type:"client-ready",props:{servingVersion:_readyServingVersion,sessionVersionHash:_readySessionVersionHash}}])
            }
            else{
                if(this.params.onUpdate!==undefined){
                    try{
                        this.params.onUpdate()
                    }
                    catch (e){
                        console.error(e)
                    }
                }
                const _updatedServingVersion = this.getCurrentVersionId() as string
                const _updatedSessionVersionHash = getActiveSessionData(this.params.key,this.envKey)?.versionHash
                if(_updatedServingVersion !== this._lastTracedServingVersion || _updatedSessionVersionHash !== this._lastTracedSessionVersionHash){
                    this._lastTracedServingVersion = _updatedServingVersion
                    this._lastTracedSessionVersionHash = _updatedSessionVersionHash
                    this.sendTrace([{clientSideId:generateUUID(),clientSideTsMs:Date.now(),type:"client-state-updated",props:{servingVersion:_updatedServingVersion,sessionVersionHash:_updatedSessionVersionHash}}])
                }
            }
            this._notifiedData = JSON.parse(JSON.stringify(notifyData))
        }

        private handleStatusUpdate(){
            if(this.status !="ACTIVE" && this.currentConfigGroupsData.default){
                this.status = "ACTIVE"
            }
            if(this.sessionStatus != "ACTIVE" && this.currentTargetingData.default){
                this.sessionStatus = "ACTIVE"
            }
        }

        private reinitSession(){
            const sessionData = getActiveSessionData(this.params.key, this.envKey)
            if(this._sseEventSource){
                this._sseEventSource.close()
            }
            this.sessionStatus = "DEACTIVE"
            this.currentTargetProperties = undefined
            this.currentTargetingData = {}
            this._contextAssignments = []
            if(sessionData?.key){
                this._previousSessionKey = sessionData.key
            }
            clearActiveSessionData(this.params.key, this.envKey)
            this.handleStatusUpdate()
            this.notifyConfigUpdate()
            this.runSSESource({key:this._sseKey, source: this._sseSource})
        }

        private getCombinedDistributionContent(): DistributionObjContent{
            if(this.status!="ACTIVE"){
                return
            }
            const baseObj = this.currentConfigGroupsData.default
            const contentModifiers = baseObj.contentModifiers
            const modifierExtras: DistributionObjContent[] = []
            if(contentModifiers?.keys?.length){
                for(const key of contentModifiers.keys){
                    const modifier = contentModifiers.data[key]
                    if(evaluateModifier(modifier, this._visitorId, this._contextAssignments) && modifier.content){
                        modifierExtras.push(modifier.content)
                    }
                }
            }
            if(this.isSessionActive()){
                const targetDistributionKeys = this.currentTargetingData.default?.distributionKeys || []
                const distributionData = this.currentTargetingData.default.distributionData
                const targetingExtras = targetDistributionKeys.map(item=>distributionData[item]?.content).filter(item=>item!=undefined)
                return combineDistributionObjContent({
                    base: baseObj.content,
                    extras: [...modifierExtras, ...targetingExtras]
                })
            }
            else if(modifierExtras.length){
                return combineDistributionObjContent({
                    base: baseObj.content,
                    extras: modifierExtras
                })
            }
            else{
                return baseObj.content
            }
        }

        init() {
            for(const [k,v] of Object.entries(this.params.sources)){
                if(v.type=="http-fetch"){
                    this.runHttpSource({key: k, source: v})
                }
                if(v.type=="sse"){
                    this.runSSESource({key: k, source: v});
                }
            }
        }
        private async precacheHttpSource({key, source}:{key: string, source:HttpFetchSource}){
            if(source.enablePolling || source.cacheMode!="full"){
                return
            }
            const fetchOptions = getFetchOptions(source)
            fetch(this.getHttpPath(source),fetchOptions as unknown)
        }

        private async precacheSseSource({key, source}:{key: string, source:SSESource}){
            if(!this.getCurrentVersionId()){
                return
            }
            const fetchOptions = getFetchOptions(source,{fetchSource:"cdn-cached",versioned:true})
            fetch(this.getHttpPath({baseUrl:source.fetchBaseUrls.cdnCached,useVersionedUrl:true}),fetchOptions as unknown)
        }

        private async precacheSession({baseUrl}:{baseUrl:string}){
            const sessionData = getActiveSessionData(this.params.key, this.envKey)
            if(!sessionData || !sessionData?.key){
                return
            }
            const csVesrionUrl = baseUrl+this.envKey+"/cs-"+sessionData.key+"--vh-"+sessionData.versionHash+".json"
            fetch(csVesrionUrl)
        }

        private async fetchHttp({url,fetchOptions}:{url:string, fetchOptions:any}){
            let r:Response, data:DistributionObjData
            try{
                r = await fetchRetry(url, 50, 2 , fetchOptions as unknown)
            }catch(e){
                throw "NetworkError"
            }
            if(r.status==404){
                throw "HTTP 404"
            }
            if(r.status!=200){
                throw "Unexpected HTTP status: "+r.status
            }
            try{
                return await r.json()
            }catch(e){
                throw "Invalid Distribution Object Data"
            }
        }
        private async fetchHttpAndProcess({url,fetchOptions}:{url:string, fetchOptions:any}){
            const data = await this.fetchHttp({url, fetchOptions}) as DistributionObjData
            this.handleDistributionObj(data)
        }

        private async handleSSEvent({event, source}:{event:any,source:SSESource}){
            //console.log("processing event ",event)
            const eventData = JSON.parse(event.data)
            const versionId = eventData.meta?.versionId
            const versionTs = eventData.meta?.versionTs
            if(!this.isSessionRequired()){
                if(this.getCurrentVersionTs()<versionTs){
                    const fetchOptions = getFetchOptions(source,{fetchSource:"direct",versioned:true})
                    await this.fetchHttpAndProcess({url:this.getHttpPath({baseUrl:source.fetchBaseUrls.direct,versionId}),fetchOptions})
                }
            }
            else{
                const key = eventData.key || ""
                const distributionObjKey = "a-"+this.params.accountId+"/"+key
                switch(event.type){
                    case "found":
                    case "updated":
                        const data = await this.fetchHttp({url:this.getHttpPath({baseUrl:source.fetchBaseUrls.direct, distributionObjKey, versionId}),fetchOptions:{}}) as DistributionObjData
                        this.handleDistributionObj(data)
                        await this.refreshSession({baseUrl: source.fetchBaseUrls.direct})
                        break
                    case "session-found":
                        const existingSessionData = getActiveSessionData(this.params.key, this.envKey)
                        const versionHash = eventData.versionHash
                        if(existingSessionData.versionHash != versionHash){
                            const sessionData = {"key": existingSessionData.key, "versionHash": versionHash}
                            setActiveSessionData(this.params.key, this.envKey, sessionData)
                            this.handleSessionData(eventData)
                            await this.precacheSession({baseUrl: source.fetchBaseUrls.direct})
                        }
                        break
                    case "session-updated":
                        await this.refreshSession({baseUrl: source.fetchBaseUrls.direct})
                        break
                }
            }
        }

        private async continueSSESource({key, source, skipWait}:{key: string, source:SSESource, skipWait?:boolean}){
            if(!skipWait){
                await wait(1000)
            }
            
            if(this.isSessionRequired()){
                try{
                    await this.ensureSession({baseUrl: source.fetchBaseUrls.direct})
                }
                catch(e){
                    console.error(e)
                    this.continueSSESource({key:key, source: source})
                    return
                }
            }
            const ssePath = this.getSSEventsPath({baseUrl:source.eventsBaseUrl})
            if(this._sseEventSource){
                this._sseEventSource.close()
            }
            const es = getSSEventSource(ssePath)
            this._sseEventSource = es
            es.addEventListener("open", () => this.sendTrace([{clientSideId:generateUUID(),clientSideTsMs:Date.now(),type:"stream-connected",props:{}}]))

            for(const eachEventName of ["updated","found", "session-found", "session-updated"]){
                es.addEventListener(eachEventName, (event)=>this.handleSSEvent({event:event, source:source}))
            }
            es.addEventListener("error", (event) => {es.close();this.continueSSESource({key:key, source: source})});
        }

        private async fetchHttpAndProcessWithFallbackHell({objKey, source}:{objKey: string, source: SSESource}){
            const distributionObjKey = "a-"+this.params.accountId+"/"+objKey
            try{
                const fetchOptions = getFetchOptions(source,{fetchSource:"cdn-cached",versioned:true})
                await this.fetchHttpAndProcess({url:this.getHttpPath({baseUrl:source.fetchBaseUrls.cdnCached, distributionObjKey, useVersionedUrl:true}),fetchOptions})
            }
            catch(e){
                if(["NetworkError","HTTP 404"].includes(e) || 
                (typeof e=="string" && e.startsWith("Unexpected HTTP status:"))){
                try{
                const fetchOptions = getFetchOptions(source,{fetchSource:"static-store",versioned:true})
                await this.fetchHttpAndProcess({url:this.getHttpPath({baseUrl:source.fetchBaseUrls.staticStore, distributionObjKey, useVersionedUrl:true}),fetchOptions})
                }catch(e){
                if(["NetworkError","HTTP 404"].includes(e) || 
                (typeof e=="string" && e.startsWith("Unexpected HTTP status:"))){
                    try{
                    const fetchOptions = getFetchOptions(source,{fetchSource:"direct",versioned:true})
                    await this.fetchHttpAndProcess({url:this.getHttpPath({baseUrl:source.fetchBaseUrls.direct, distributionObjKey, useVersionedUrl:true}),fetchOptions})
                    }
                    catch(e){
                        if(["NetworkError","HTTP 404"].includes(e) || 
                        (typeof e=="string" && e.startsWith("Unexpected HTTP status:"))){
                            //last try with static store without version, to catch deleted versions
                            const fetchOptions = getFetchOptions(source,{fetchSource:"static-store",versioned:false})
                            await this.fetchHttpAndProcess({url:this.getHttpPath({baseUrl:source.fetchBaseUrls.staticStore, distributionObjKey, useVersionedUrl:false}),fetchOptions})
                        }
                        else{
                            throw e
                        }
                    }
                }else{
                    throw e
                }
                }   
                }else{
                    throw e
                }
            }
        }

        private async runSSESource({key, source}:{key: string, source:SSESource}){
            this._sseSource = source
            this._sseKey = key
            this._directBaseUrl = source.fetchBaseUrls.direct
            const sessionFlow = async ():Promise<"SUCCESS"|"ERROR"> => {
                if(this.isSessionRequired()){
                    try{
                        await this.ensureSession({baseUrl:source.fetchBaseUrls.direct})
                    }
                    catch(e){
                        console.error(e)
                        this.sessionStatus="ERROR"
                        return "ERROR"
                    }
                }
                else{
                    try{
                    await this.tryPreviousSessionClose({baseUrl:source.fetchBaseUrls.direct})
                    }
                    catch(e){
                        console.error(e)
                    }
                }
                return "SUCCESS"
            }
            const defaultGroupFlow = async ():Promise<"SUCCESS"|"ERROR"> => {
                if(this.status == "INITIALIZING" || this.status == "DEACTIVE"){
                    try{
                        await this.fetchHttpAndProcessWithFallbackHell({objKey: this.defaultGroupObjKey, source})
                    }
                    catch(e){
                        console.error(e)
                        return "ERROR"
                    }
                    return "SUCCESS"
                }
            }
            
            const [defaultGroupRes, sessionRes] = await Promise.all([defaultGroupFlow(), sessionFlow()])
            if(defaultGroupRes=="ERROR" && sessionRes=="ERROR"){
                this.status="ERROR"
                return
            }
            this.continueSSESource({key:key, source: source, skipWait: true})
        }

        private async runHttpSource({key, source}:{key: string, source:HttpFetchSource}){
            const fetchOptions = getFetchOptions(source)
            do {
                try{
                    this.fetchHttpAndProcess({url:this.getHttpPath(source),fetchOptions})
                    if(!source.enablePolling){
                        break
                    }
                    else{
                        await wait(source.pollingDelay || 5000);
                    }
                }
                catch (ex){
                    console.log(ex)
                    await wait(source.pollingDelay || 5000);
                }
            } while (true);
        }

        private sendTrace(events: {clientSideId:string, clientSideTsMs:number, type:string, props:object}[]){
            if(!this._directBaseUrl) return
            const sessionData = getActiveSessionData(this.params.key, this.envKey)
            const payload = {
                visitorId: this._visitorId,
                sdkName: "cb-client-es-core",
                sdkVersion: SDK_VERSION,
                subSdkName: this.params.subSdkName,
                subSdkVersion: this.params.subSdkVersion,
                servingVersion: this.getCurrentVersionId(),
                sessionVersionHash: sessionData?.versionHash,
                events
            }
            const body = typeof btoa !== 'undefined'
                ? btoa(JSON.stringify(payload))
                : Buffer.from(JSON.stringify(payload)).toString('base64')
            const traceUrl = this._directBaseUrl+"a-"+this.params.accountId+"/p-"+this.params.projectId+"/e-"+this.params.environmentId+"/trace"
            fetch(traceUrl, {method:"POST", headers:{"Content-Type":"text/plain"}, body, keepalive:true}).catch(()=>{})
        }

                private getHttpPath({baseUrl,distributionObjKey,useVersionedUrl,versionId}:{baseUrl:string, distributionObjKey?:string, versionId?:string,useVersionedUrl?:boolean}):string {
            if(distributionObjKey === undefined){
                distributionObjKey = this.distributionObjKey
            }
            let url: string
            if(useVersionedUrl||versionId){
                const urlVersionId = versionId || getDistObjectCurrentVersionId(this.params.key, distributionObjKey)
                if(urlVersionId){
                    url = baseUrl+distributionObjKey+"--v-"+urlVersionId+".json"
                }
            }
            if(!url){
                url = baseUrl+distributionObjKey+".json"
            }
            return url
        }

        private getSSEventsPath({baseUrl}:{baseUrl:string}):string|undefined {
            if(this.isSessionRequired()){
                return this.getSessionSSEventsPath({baseUrl})
            }
            if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
                return baseUrl+this.distributionObjKey+".events?sv="+this.getCurrentVersionId()+"&vid="+this._visitorId+"&m=sp"
            }
            return baseUrl+this.distributionObjKey+".events?sv="+this.getCurrentVersionId()+"&vid="+this._visitorId
        }
        private getSessionSSEventsPath({baseUrl}:{baseUrl:string}):string|undefined {
            const sessionData = getActiveSessionData(this.params.key, this.envKey)
            if(!sessionData?.key){
                return
            }
            const urlPath = baseUrl+"a-"+this.params.accountId+"/p-"+this.params.projectId+"/e-"+this.params.environmentId+"/cs-"+sessionData.key+".events"
            if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
                return urlPath+"?svh="+sessionData.versionHash+"&vid="+this._visitorId+"&m=sp"
            }
            return urlPath+"?svh="+sessionData.versionHash+"&vid="+this._visitorId
        }

        private updateDistributionObj(obj:DistributionObjData,{skipHandleUpdates=false}:{skipHandleUpdates:boolean}={skipHandleUpdates:false}){
            const objKey = obj.key || this.defaultGroupObjKey
            if(objKey.match(ENV_DEFAULT_CONFIG_GROUP_DIST_OBJ_KEY_REGEX)){
                this.currentConfigGroupsData.default = obj
                if(this.currentConfigGroupsData.default?.meta?.versionId){
                    setDistObjectCurrentVersionId(this.params.key, this.distributionObjKey, this.currentConfigGroupsData.default.meta.versionId)
                }
                for(const [k,v] of Object.entries(this.params.sources)){
                    if(v.type=="http-fetch"){
                        this.precacheHttpSource({key: k, source: v})
                    }
                    else if(v.type=="sse"){
                        //this.precacheSseSource({key: k, source: v})
                    }
                }
            }
            else{
                this.currentTargetingData.default.distributionData[objKey] = obj
            }
            if(!skipHandleUpdates){
                this.handleStatusUpdate()
                this.notifyConfigUpdate()
            }
        }
        

        private handleDistributionObj(obj:DistributionObjData,{skipHandleUpdates=false}:{skipHandleUpdates:boolean}={skipHandleUpdates:false}){
            const objKey = obj.key || this.defaultGroupObjKey
            if(objKey.match(ENV_DEFAULT_CONFIG_GROUP_DIST_OBJ_KEY_REGEX)){
                if(this.currentConfigGroupsData?.default===undefined){
                    this.updateDistributionObj(obj, {skipHandleUpdates})
                }
                else{
                    if(this.currentConfigGroupsData.default.meta.versionTs<obj.meta.versionTs){
                        this.updateDistributionObj(obj, {skipHandleUpdates})
                    }
                }
            }
            else{
                const existingObj = this.currentTargetingData.default.distributionData[obj.key]
                if(existingObj === undefined || existingObj.meta.versionTs<obj.meta.versionTs){
                    this.updateDistributionObj(obj, {skipHandleUpdates})
                }
            }
        }

        public async waitToLoad({timeout=60000}:{timeout?:number}={}):Promise<CbStatusType>{
            if(this.status=="INITIALIZING"){
                await Promise.race([
                    new Promise((resolve, reject) => setTimeout(()=>reject(new Error('Wait timed out')), timeout)),
                    new Promise(resolve => this.eventBus.on('status_updated', resolve))
                ])
            }
            return this.status
        }
        public async waitToLoadTargeting({timeout=60000}:{timeout?:number}={}):Promise<CbStatusType>{
            const timeBeforeLoad = new Date().getTime()
            await this.waitToLoad({timeout})
            const timeAfterLoad = new Date().getTime()

            if(this.targetingStatus=="INITIALIZING"){
                await Promise.race([
                    new Promise((resolve, reject) => setTimeout(()=>reject(new Error('Wait timed out')), Math.max(0,timeout-Math.abs(timeAfterLoad-timeBeforeLoad)))),
                    new Promise(resolve => this.eventBus.on('session_status_updated', resolve))
                ])
            }
            return this.targetingStatus
        }

        public getCurrentVersionId():String{
            return this.currentConfigGroupsData?.default.meta?.versionId
        }
        public getCurrentVersionTs():String{
            return this.currentConfigGroupsData?.default?.meta?.versionTs
        }

        public getAllFlags():CbFlagsType{
            const distributionContent = this.getCombinedDistributionContent()
            if(distributionContent===undefined){
                return undefined
            }
            const values = {}
            const flagsData = Object.entries(distributionContent).
                filter(([k,v])=>v.optionType=="FLAG")
            if(flagsData===undefined){
                return undefined
            }
            for(const [k,v] of flagsData){
                values[k] = (v as FlagOptionData).flagValue
            }
            return values
        }

        public getFlag(key:string):CbFlagType{
            const distributionContent = this.getCombinedDistributionContent()
            if(distributionContent===undefined){
                return undefined
            }
            return (Object.entries(distributionContent).
                filter(([k,v])=>v.optionType=="FLAG"&&k==key)[0]?.[1] as FlagOptionData)?.flagValue
        }

        public getNumber(key:string):CbNumberType{
            const distributionContent = this.getCombinedDistributionContent()
            if(distributionContent===undefined){
                return undefined
            }
            return (Object.entries(distributionContent).
                filter(([k,v])=>v.optionType=="NUMBER"&&k==key)[0]?.[1] as NumberOptionData)?.numberValue
        }

        public getAllNumbers():CbNumbersType{
            const distributionContent = this.getCombinedDistributionContent()
            if(distributionContent===undefined){
                return undefined
            }
            const values = {}
            const numbersData = Object.entries(distributionContent).
                filter(([k,v])=>v.optionType=="NUMBER")
            if(numbersData===undefined){
                return undefined
            }
            for(const [k,v] of numbersData){
                values[k] = (v as NumberOptionData).numberValue
            }
            return values
        }

        public getText(key:string):CbTextType{
            const distributionContent = this.getCombinedDistributionContent()
            if(distributionContent===undefined){
                return undefined
            }
            return (Object.entries(distributionContent).
                filter(([k,v])=>v.optionType=="TEXT"&&k==key)[0]?.[1] as TextOptionData)?.textValue
        }

        public getAllTexts():CbTextsType{
            const distributionContent = this.getCombinedDistributionContent()
            if(distributionContent===undefined){
                return undefined
            }
            const values = {}
            const textsData = Object.entries(distributionContent).
                filter(([k,v])=>v.optionType=="TEXT")
            if(textsData===undefined){
                return undefined
            }
            for(const [k,v] of textsData){
                values[k] = (v as TextOptionData).textValue
            }
            return values
        }

        public getJson(key:string):CbJsonType{
            const distributionContent = this.getCombinedDistributionContent()
            if(distributionContent===undefined){
                return undefined
            }
            return (Object.entries(distributionContent).
                filter(([k,v])=>v.optionType=="JSON"&&k==key)[0]?.[1] as JsonOptionData)?.jsonValue
        }

        public getAllJsons():CbJsonsType{
            const distributionContent = this.getCombinedDistributionContent()
            if(distributionContent===undefined){
                return undefined
            }
            const values = {}
            const jsonsData = Object.entries(distributionContent).
                filter(([k,v])=>v.optionType=="JSON")
            if(jsonsData===undefined){
                return undefined
            }
            for(const [k,v] of jsonsData){
                values[k] = (v as JsonOptionData).jsonValue
            }
            return values
        }

        constructor(params:ClientParams){
            this.status = "INITIALIZING"
            this.sessionStatus = "DEACTIVE"
            if(params.sources === undefined){
                params.sources = {
                    //"full-cache-fetch":{"type": "http-fetch", baseUrl:Config.CB_DEFAULT_HTTP_FETCH_FULL_CACHE_BASE_URL, cacheMode: "full", useVersionedUrl: true},
                    //"none-cache-fetch":{"type": "http-fetch", baseUrl:Config.CB_DEFAULT_HTTP_FETCH_NONE_CACHE_BASE_URL, cacheMode: "none", enablePolling: true},
                    //"none-cache-fetch":{"type": "http-fetch", baseUrl:"http://localhost:4002/", cacheMode: "default", enablePolling: true},
                    "sse": {
                        type: "sse", eventsBaseUrl: Config.CB_DEFAULT_SSE_BASE_URL,
                        fetchBaseUrls: {
                            cdnCached: Config.CB_DEFAULT_CDN_CACHED_FETCH_BASE_URL,
                            staticStore: Config.CB_DEFAULT_STATIC_STORE_FETCH_BASE_URL,
                            direct: Config.CB_DEFAULT_DIRECT_FETCH_BASE_URL
                        }
                    }
                }
            }
            if(params.configGroupKey === undefined){
                params.configGroupKey = "default"
            }
            if(params.key == undefined){
                params.key = "default"
            }
            
            this.envKey = "a-"+params.accountId+"/p-"+params.projectId+"/e-"+params.environmentId
            this.distributionObjKey = "a-"+params.accountId+"/p-"+params.projectId+"/e-"+params.environmentId+"/cg-"+params.configGroupKey


            this.defaultGroupObjKey = "p-"+params.projectId+"/e-"+params.environmentId+"/cg-"+params.configGroupKey
            this.params = params
            this._visitorId = getOrCreateVisitorId(params.key, this.distributionObjKey)

            if(params.targetProperties!==undefined){
                this._targetProperties = params.targetProperties
            }
        }
    }

    export function init(params:ClientParams):Client{
        const client = new Client(params)
        client.init()
        return client
    }
}
