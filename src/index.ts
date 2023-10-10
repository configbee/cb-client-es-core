import { ConfigbeeClient } from "./ConfigbeeClient";
export default ConfigbeeClient;
//assign if module mode available, for node
try{
    Object.assign(module.exports, ConfigbeeClient)
}
catch{

}