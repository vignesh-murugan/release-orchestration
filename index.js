#!/usr/bin/env node

/**
 * Tool to update the 'System Integration.profile' to be updated with the objects
 * added in the declarative-objects component(/sfdc/declarative/objects)
 *
 * editable and readable will be always true for System Integration.profile
 *
 * Path and profile is hard coded just make sure we do not use this for any
 * other use-cases. If need in future this can be expanded to package/cli.
 */
var fs = require("fs-extra");
var xmljs = require("xml-js");
var prettifyXml = require("prettify-xml");
var xmlbuilder = require("xmlbuilder");

var fieldPermissions = [];
var objPath = "../../sfdc/declarative/objects/";
var profilePath = "../../sfdc/declarative/profiles/";
var packageFile = "../../sfdc/declarative/package.xml";
var system_profile_fn = "System Integration.profile";
var sysIntXml = "";
const options = { indent: 2, newline: "\n" };

if (fs.existsSync(objPath)) {
  console.log("Objects folder exist.. Updating System Integration permissions");

  /**
   * Read file in the directory and parse the field's fullName
   */
  fs.readdir(objPath, (error, files) => {
    if (error) {
      console.error("Error on reading the directory : " + error);
    }
    files.forEach(file => {
      var fileName = file.split(".")[0];
      console.log("Reading file " + file);
      var data = fs.readFileSync(objPath + file);
      var jsonString = xmljs.xml2json(data, { compact: true, spaces: 1 });
      var obj = JSON.parse(jsonString);

      var fields = obj.CustomObject.fields;
      if (typeof fields == "undefined") {
        console.error(file + " does not have any fields in it.");
      } else {
        if (Array.isArray(fields)) {
          fields.forEach(field => {
            // Any field that has tag require true will not accepted in the profile
            if (field.required && field.required._text != "true") {
              fieldPermissions.push(fileName + "." + field.fullName._text);
            } else if (!field.required) {
              fieldPermissions.push(fileName + "." + field.fullName._text);
            }
          });
        } else {
          fieldPermissions.push(fileName + "." + fields.fullName._text);
        }
      }
    });

    if (fieldPermissions.length != 0) {
      console.log(
        "FieldPermission will be added to profile are :" + fieldPermissions
      );
      if (fs.existsSync(profilePath + system_profile_fn)) {
        console.log(system_profile_fn + " file exist");
        var jsonSystemProfile = xmljs.xml2json(
          fs.readFileSync(profilePath + system_profile_fn)
        );
        var _obj_sp = JSON.parse(jsonSystemProfile);
        var elements_array = _obj_sp.elements[0].elements;
        console.log(
          "Exsiting list of fields in profile:" + elements_array.length
        );
        fieldPermissions.forEach(fieldPermission => {
          var isAlreadyInProfile = false;
          for (i = 0; i < elements_array.length; i++) {
            if (elements_array[i].name == "fieldPermissions") {
              var fieldValue = elements_array[i].elements[1].elements[0].text;
              if (fieldValue == fieldPermission) {
                isAlreadyInProfile = true;
                break;
              }
            }
          }

          if (!isAlreadyInProfile) {
            var new_obj = {
              type: "element",
              name: "fieldPermissions",
              elements: [
                {
                  type: "element",
                  name: "editable",
                  elements: [
                    {
                      type: "text",
                      text: "true"
                    }
                  ]
                },
                {
                  type: "element",
                  name: "field",
                  elements: [
                    {
                      type: "text",
                      text: fieldPermission
                    }
                  ]
                },
                {
                  type: "element",
                  name: "readable",
                  elements: [
                    {
                      type: "text",
                      text: "true"
                    }
                  ]
                }
              ]
            };
            console.log("Adding field : " + fieldPermission);
            elements_array.push(new_obj);
          }
        });

        console.log("New list of fields in profile:" + elements_array.length);

        elements_array.sort((a, b) => {
          if (a.name < b.name) return 1;
          return -1;
        });

        sysIntXml = prettifyXml(
          xmljs.json2xml(JSON.stringify(_obj_sp)),
          options
        );
      } else {
        /**
         * Create new xml for System Integration.profile
         * Ex: <fieldPermissions>
         *        <editable>true</editable>
         *        <field>ObjectName.field-fullName</field>
         *        <readble>true</readble>
         *    </fieldPermisssions>
         */
        console.log("System Integration profile is not exist..creating file");
        var xml = xmlbuilder.create("Profile", {
          version: "1.0",
          encoding: "UTF-8"
        });
        xml.att("xmlns", "http://soap.sforce.com/2006/04/metadata");
        fieldPermissions.forEach(fieldPermission => {
          var xmlFP = xml.ele("fieldPermissions");
          xmlFP.ele("editable", true);
          xmlFP.ele("field", fieldPermission);
          xmlFP.ele("readable", true);
        });

        sysIntXml = xml.end({ pretty: true });
      }

      /**
       * Write the content in the profile file, this overrides if the file exists.
       */
      console.log(
        "--------------------------------------------------------------------"
      );
      console.log("updating system integration profile:" + sysIntXml);
      console.log(
        "--------------------------------------------------------------------"
      );
      writeFile(sysIntXml, profilePath, system_profile_fn);

      /**
       * Update package.xml to include the member for system integration in Profile
       */
      if (fs.existsSync(packageFile)) {
        fs.readFile(packageFile, (error, data) => {
          if (error) {
            console.error("Error while reading the package.xml file");
          }
          var hasSystemProfile = false;
          /**
           * convert xml to json for updating
           * Sample JSON
           * {
           * elements:[
           * {  elements:[{
           *  type:"member",
           *  elements: [{
           *    type: "text",
           *    text: "System Integration"
           * }]
           * }
           * ]}]
           * }
           */
          var objJson = JSON.parse(xmljs.xml2json(data, { reversible: true }));
          var outerElement = objJson.elements[0].elements;
          for (outElement in outerElement) {
            var innerElement = outerElement[outElement].elements;

            for (inElement in innerElement) {
              if (innerElement[inElement].name == "name") {
                if (innerElement[inElement].elements[0].text == "Profile") {
                  for (inElement in innerElement) {
                    if (innerElement[inElement].name == "members") {
                      hasProfileMember = true;
                      var memberElement = innerElement[inElement].elements;
                      if (memberElement[0].text == "System Integration") {
                        hasSystemProfile = true;
                        break;
                      } else {
                        hasSystemProfile = false;
                      }
                    }
                  }
                  if (hasSystemProfile) {
                    console.log("Package.xml has Profile");
                    break;
                  } else {
                    console.log(
                      "Package.xml does not has Profile, adding profile"
                    );
                    var sysIntElement = {
                      type: "element",
                      name: "members",
                      elements: [
                        {
                          type: "text",
                          text: "System Integration"
                        }
                      ]
                    };
                    innerElement.push(sysIntElement);
                    break;
                  }

                  var xmlData = prettifyXml(
                    xmljs.json2xml(JSON.stringify(objJson)),
                    options
                  );

                  fs.writeFileSync(packageFile, xmlData);
                }
              }
            }
          }
        });
      }
    } else {
      console.log("No field Permisssion found in the objects to add");
    }
  });
} else {
  console.log(
    "No object folder exist.. nothing to update the System Integration profile.. ciao"
  );
}

async function writeFile(xmlValue, file_path, file_name) {
  if (!fs.existsSync(profilePath)) {
    fs.mkdir(profilePath, err => {
      if (err) {
        console.error("error while creating folder");
      }
    });
  }

  await fs.writeFile(
    file_path + file_name,
    xmlValue,
    (err = {
      if(err) {
        console.error("error while writing the profile " + err);
      }
    })
  );
}
