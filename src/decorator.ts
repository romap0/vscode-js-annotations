import * as vscode from "vscode";
import { Annotations } from "./annotationProvider";
import { IFunctionCallObject } from "./functionCallObject";

export async function decorateFunctionCall(currentEditor: vscode.TextEditor, documentCache: any, decArray: vscode.DecorationOptions[], fc: IFunctionCallObject): Promise<void> {
  // Check for existence of functionCallObject and a defintion location
  if (fc === undefined || fc.definitionLocation === undefined) {
    return;
  }

  // config option to hide annotations if param and arg names match
  const hideIfEqual = vscode.workspace.getConfiguration("jsannotations").get("hideIfEqual");

  const document = await loadDefinitionDocument(fc, documentCache);
  const definitionLine = document.lineAt(fc.definitionLocation.range.start.line).text;

  const paramList = grabPossibleParameters(fc, definitionLine);

  if (paramList.length > 0) {
    const functionCallLine = currentEditor.document.lineAt(fc.lineNumber).text;

    if (shouldntBeDecorated(paramList, fc, functionCallLine, definitionLine)) {
      return;
    }

    // Look to see if a param is a rest parameter (ex: console.log has a rest parameter called ...optionalParams)
    const restParamIdx = paramList.findIndex((item) => item.substr(0, 3) === "...");

    // If it exists, remove the triple dots at the beginning
    if (restParamIdx !== -1) {
      paramList[restParamIdx] = paramList[restParamIdx].slice(3);
    }

    if (fc.paramLocations && fc.paramNames) {
      for (const ix in fc.paramLocations) {
        if (fc.paramLocations.hasOwnProperty(ix)) {
          const idx = parseInt(ix, 10);

          // skip when arg and param match and hideIfEqual config is on
          if (hideIfEqual && fc.paramNames[idx] === paramList[idx]) {
            continue;
          }

          let decoration: vscode.DecorationOptions;

          const currentArgRange = fc.paramLocations[idx];

          if (restParamIdx !== -1 && idx >= restParamIdx) {
            decoration = Annotations.paramAnnotation(paramList[restParamIdx] + `[${idx - restParamIdx}]: `, currentArgRange);
          } else {
            decoration = Annotations.paramAnnotation(paramList[idx] + ": ", currentArgRange);
          }

          decArray.push(decoration);
        }
      }
    }
  }
}

async function loadDefinitionDocument(fc: IFunctionCallObject, documentCache: any) {
  let document: vscode.TextDocument;

  // Currently index documentCache by the filename (TODO: Figure out better index later)
  const pathNameArr = fc.definitionLocation.uri.fsPath.split("/");
  const pathName = pathNameArr[pathNameArr.length - 1];

  // If the document is not present in the cache, load it from the filesystem, otherwise grab from the cache
  if (documentCache[pathName] === undefined) {
    document = await vscode.workspace.openTextDocument(fc.definitionLocation.uri);
    documentCache[pathName] = document;
  } else {
    document = documentCache[pathName];
  }

  return document;
}

function grabPossibleParameters(fc: IFunctionCallObject, definitionLine: string): string[] {
  let paramList: string[] = [];

  // regex to search for function call arguments. Regex found at https://stackoverflow.com/a/13952890
  const paramRegex = /\( *([^)]+?) *\)/;

  const definitionParamRegexMatches = definitionLine.match(paramRegex);

  if (definitionParamRegexMatches) {
    if (fc.functionRange === undefined) {
      return;
    }

    paramList = definitionParamRegexMatches[1].split(/\s*,\s*/);

    paramList = paramList.map((param) => {
      // Extract identifiers
      const identifiers = param.match(/([\.a-zA-Z0-9]+):?/);

      if (identifiers && identifiers.length > 1) {
        return identifiers[1];
      }
      return "";
    }).filter((param) => param !== "");
  }

  return paramList;
}

function shouldntBeDecorated(paramList: string[], functionCall: IFunctionCallObject, functionCallLine: string, definitionLine: string): boolean {
  // If the functionName is one of the parameters, don't decorate it
  if (paramList.some((param) => param === functionCall.functionName)) {
    return true;
  }

  // If the line that is extracted is a function definition rather than call, continue on without doing anything
  if (functionCallLine.includes("function ")) {
    return true;
  }

  // Don't decorate if the definition is inside a for loop
  if (definitionLine.includes("for (") || definitionLine.includes("for (")) {
    return true;
  }

  return false;
}
