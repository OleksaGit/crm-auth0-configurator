'use strict';

const fs = require('fs');
const path = require('path');
const { defaultPermissions } = require('./src/data/permissions');
const { resourceServerIdentifier } = require('./src/config');
const { client } = require('./src/services/auth0');

const currentDirPath = path.join(__dirname, 'src/data/output');

(async () => {

  function getIdResServ (resourceServersArr) {
    const targetResServ = resourceServersArr.find(item => item.identifier === resourceServerIdentifier);
    return targetResServ.identifier;
  }

  async function updateResourceServer (defaultPermissions) {
    const resourceServersArr = await client.getResourceServers();
    const idResServ = { id: getIdResServ(resourceServersArr) };

    await client.updateResourceServer(idResServ, {
      scopes: defaultPermissions,
    });
    console.log('update resource server done');
  }

  async function getRolesAuth0 () {
    return client.getRoles();
    // const rolesId = await client.getRoles();
    // const permissionsRoles = [];
    // for (let i = 0; i < rolesId.length; i++) {
    //   let { id } = rolesId[i];
    //   let { name } = rolesId[i];
    //   let params = { id: id };
    //   permissionsRoles.push({ name, id, permissions: await client.getPermissionsInRole(params) });
    // }
    // return permissionsRoles;
  }

  async function getRolesFiles (currentDirPath) {
    const result = [];
    fs.readdirSync(currentDirPath).forEach(function (nameFile) {
      if (nameFile.match(/role/gi)) {
        const filePath = path.join(currentDirPath, nameFile);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          result.push({
            filePath,
            nameFile,
            roleInFile: require(filePath),
          });
        }
      }
    });
    return result;
  }

  async function createRole (rolesFiles) {
    for (let i = 0; i < rolesFiles.length; i++) {
      await client.createRole({
        name: rolesFiles[i].roleInFile.name,
        description: rolesFiles[i].roleInFile.description,
      });
      console.log(`create role "${rolesFiles[i].roleInFile.name}" done`);
    }
    let updRolesAuth0 = await getRolesAuth0();

    for (let i = 0; i < rolesFiles.length; i++) {
      for (let j = 0; j < updRolesAuth0.length; j++) {
        if (rolesFiles[i].roleInFile.name === updRolesAuth0[j].name) {
          client.roles.addPermissions({ id: updRolesAuth0[j].id }, { permissions: rolesFiles[i].roleInFile.permissions });
        }
      }
    }

  }

  async function deleteRoles (rolesAuth0) {
    for (let i = 0; i < rolesAuth0.length; i++) {
      await client.deleteRole({ id: rolesAuth0[i].id });
      console.log(`delete role "${rolesAuth0[i].name}" done`);
    }
  }

  async function updateRoles (rolesForUpdate) {
    for (let i = 0; i < rolesForUpdate.length; i++) {
      const current = rolesForUpdate[i];
      await client.roles.addPermissions({ id: current.id }, { permissions: current.permissions });
      console.log(`update role "${current.name}" done`);
    }
  }

  async function compareAndUpdateRoles () {
    const rolesFiles = await getRolesFiles(currentDirPath);
    const rolesAuth0 = await getRolesAuth0();
    const rolesForUpdate = [];

    // prepare roles for update in Auth0
    for (let i = 0; i < rolesFiles.length; i++) {
      for (let j = 0; j < rolesAuth0.length; j++) {
        if (rolesFiles[i].roleInFile.name === rolesAuth0[j].name) {
          rolesForUpdate.push({
            name: rolesFiles[i].roleInFile.name,
            id: rolesAuth0[j].id,
            permissions: rolesFiles[i].roleInFile.permissions.map((value) => ({
              permission_name: value,
              resource_server_identifier: resourceServerIdentifier,
            })),
          });
        }
      }
    }

    // prepare roles auth0 and roles files, for delete and create in auth0
    for (let i = 0; i < rolesForUpdate.length; i++) {
      for (let j = 0; j < rolesAuth0.length; j++) {
        if (rolesForUpdate[i].name === rolesAuth0[j].name) {
          rolesAuth0.splice(j, 1);
          j--;
        }
      }
      for (let j = 0; j < rolesFiles.length; j++) {
        if (rolesForUpdate[i].name === rolesFiles[j].roleInFile.name) {
          rolesFiles.splice(j, 1);
          j--;
        }
      }
    }

    //update roles in Auth0
    if (rolesForUpdate.length !== 0) {
      await updateRoles(rolesForUpdate);
    }

    //delete roles in Auth0
    if (rolesAuth0.length !== 0) {
      await deleteRoles(rolesAuth0);
    }

    //create roles and add permissions for new roles in Auth0
    if (rolesFiles.length !== 0) {
      await createRole(rolesFiles);
    }

  }

  const scopes = defaultPermissions();
  await fs.promises.writeFile(
    path.join(currentDirPath, 'resource-server-scopes.json'),
    JSON.stringify({ scopes }, null, 2),
  );
  console.log(`write ${scopes.length} items in file`);

  await updateResourceServer(scopes);

  await compareAndUpdateRoles();

  console.log('done');
  process.exit(0);

})().catch(console.error);
