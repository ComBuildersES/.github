/**
 * merge-all-contributors.js
 *
 * Paso a paso:
 * 1. Define un array con los URL remotos de cada `.all-contributorsrc` junto con el nombre del repo.
 * 2. Por cada uno, hace un fetch con axios y parsea el JSON.
 * 3. Agrupa todos los objetos `contributors` por login, acumulando en un Set el nombre del repo.
 * 4. Una vez leído todo, convierte cada Set de repos a un array (campo `contributions`),
 *    y ordena a los usuarios de mayor a menor según la cantidad de repos distintos.
 * 5. Escribe `merged-all-contributorsrc.json` con la estructura mínima: `{ "contributors": [ ... ] }`.
 * 6. Genera un `CONTRIBUTORS.md` con tabla HTML, máximo 7 usuarios por fila.
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

(async () => {
  // 1) Lista de URLs de .all-contributorsrc, con el nombre corto del repo
  const sources = [
    {
      url: 'https://raw.githubusercontent.com/ComBuildersES/estudio-publico-objetivo/refs/heads/main/.all-contributorsrc',
      repoName: 'estudio-publico-objetivo'
    },
    {
      url: 'https://raw.githubusercontent.com/ComBuildersES/formatos-para-eventos/refs/heads/main/.all-contributorsrc',
      repoName: 'formatos-para-eventos'
    },
    {
      url: 'https://raw.githubusercontent.com/ComBuildersES/awesome-community-builders/refs/heads/master/.all-contributorsrc',
      repoName: 'awesome-community-builders'
    },
    {
      url: 'https://raw.githubusercontent.com/ComBuildersES/charlamos-con-community-builders/refs/heads/main/.all-contributorsrc',
      repoName: 'charlamos-con-community-builders'
    },
    {
      url: 'https://raw.githubusercontent.com/ComBuildersES/communities-directory/refs/heads/master/.all-contributorsrc',
      repoName: 'communities-directory'
    },
    {
      url: 'https://raw.githubusercontent.com/ComBuildersES/punto-de-encuentro/refs/heads/main/.all-contributorsrc',
      repoName: 'punto-de-encuentro'
    }
  ];

  // 2) Objeto temporal donde acumulamos cada contribuyente por login
  //    La estructura será:
  //    {
  //      [login]: {
  //        login,
  //        name,
  //        avatar_url,
  //        profile,        // URL al perfil (si existe en el JSON; si no, lo construimos)
  //        reposSet: Set<string>   // aquí guardamos nombres de repos (no repetidos)
  //      },
  //      ...
  //    }
  const allContributorsMap = {};

  // 3) Función para procesar cada fuente
  for (const { url, repoName } of sources) {
    try {
      const resp = await axios.get(url, { timeout: 10000 });
      const data = resp.data;

      // Si el JSON viene en string (no debería, pero por si acaso)
      let json;
      if (typeof data === 'string') {
        json = JSON.parse(data);
      } else {
        json = data;
      }

      if (!Array.isArray(json.contributors)) {
        console.warn(`El archivo ${url} no tiene campo "contributors" como array. Se ignora.`);
        continue;
      }

      // 4) Para cada contributor, extraemos los campos básicos y asociamos el repoName
      for (const contrib of json.contributors) {
        const login = contrib.login;
        const name = contrib.name || contrib.login;
        // El JSON oficial de all-contributors suele incluir avatar_url y profile (o html_url)
        const avatar_url = contrib.avatar_url || contrib.avatar; 
        // A veces se llama "profile" o "html_url". Si no existe, lo generamos:
        const profile = contrib.profile || contrib.html_url || `https://github.com/${login}`;

        if (!allContributorsMap[login]) {
          allContributorsMap[login] = {
            login,
            name,
            avatar_url,
            profile,
            reposSet: new Set()
          };
        }

        // Añadimos el repoName en su Set. De esta forma, quedará un reposSet con todos los repos distintos.
        allContributorsMap[login].reposSet.add(repoName);
      }

    } catch (err) {
      console.error(`Error descargando o parseando ${url}:`, err.message);
    }
  }

  // 5) Convertimos el mapa en un array definitivo de "contributors". 
  //    Cada objeto tendrá: login, name, avatar_url, profile, contributions: [ array de repoNames ].
  const mergedContributors = Object.values(allContributorsMap)
    .map(user => {
      return {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        profile: user.profile,
        contributions: Array.from(user.reposSet) // pasar Set a array
      };
    })
    // 6) Ordenamos de mayor a menor según la cantidad de repos (tamaño del array contributions)
    .sort((a, b) => b.contributions.length - a.contributions.length);

  // 7) Escribimos el JSON unificado en merged-all-contributorsrc.json (puedes renombrarlo a .all-contributorsrc si lo prefieres)
  const outputJson = {
    // La estructura mínima: solo un array "contributors".
    contributors: mergedContributors
  };
  const jsonPath = path.join(process.cwd(), '.all-contributorsrc');
  await fs.writeFile(jsonPath, JSON.stringify(outputJson, null, 2), 'utf8');
  console.log(`✓ Se escribió archivo JSON unificado en: ${jsonPath}`);

  // 8) Generar CONTRIBUTORS.md con tabla HTML
  // ------------------------------------------------------------------
  // Formato de celda por usuario (plantilla):
  // <td align="center" valign="top" width="14.28%">
  //   <a href="URL_PERFIL_USUARIO">
  //     <img src="URL_AVATAR" width="100px;" alt="LOGIN_USUARIO"/><br />
  //     <sub><b>NOMBRE_USUARIO</b></sub>
  //   </a><br />
  //   <!-- Listado de repos "etiquetados" numéricamente -->
  //   <a href="https://github.com/ComBuildersES/REPO1" title="REPO1">(1)</a>
  //   <a href="https://github.com/ComBuildersES/REPO2" title="REPO2">(2)</a>
  //   ...
  //   (todas las contribuciones)
  // </td>
  // ------------------------------------------------------------------

  const MAX_PER_ROW = 7;
  let mdLines = [];
  mdLines.push('<table>');
  mdLines.push('  <tbody>');

  for (let i = 0; i < mergedContributors.length; i += MAX_PER_ROW) {
    mdLines.push('    <tr>');
    const slice = mergedContributors.slice(i, i + MAX_PER_ROW);
    for (const user of slice) {
      // Para cada usuario, construimos la celda:
      mdLines.push('      <td align="center" valign="top" width="14.28%">');

      // 1) Link al perfil + avatar + nombre
      mdLines.push(`        <a href="${user.profile}">`);
      mdLines.push(`          <img src="${user.avatar_url}" width="100px;" alt="${user.login}"/><br />`);
      mdLines.push(`          <sub><b>${user.name}</b></sub>`);
      mdLines.push('        </a><br />');

      // 2) Ahora los enlaces a cada repo. Les ponemos etiqueta numérica (1), (2), ...
      //    y el href directo al repo (suponiendo que están todos en la organización ComBuildersES).
      //    Si algún repo perteneciese a otra org, habría que ajustar la URL, pero en este caso usamos siempre:
      //    https://github.com/ComBuildersES/NOMBRE_DEL_REPO
      user.contributions.forEach((repoName, idx) => {
        const repoUrl = `https://github.com/ComBuildersES/${repoName}`;
        const labelNum = idx + 1;
        mdLines.push(`        <a href="${repoUrl}" title="${repoName}">(${labelNum})</a>`);
      });

      // 3) Texto estático final:
      mdLines.push('      </td>');
    }
    mdLines.push('    </tr>');
  }

  mdLines.push('  </tbody>');
  mdLines.push('</table>');

  const mdContent = mdLines.join('\n');
  const mdPath = path.join(process.cwd(), 'CONTRIBUTORS.md');
  await fs.writeFile(mdPath, mdContent, 'utf8');
  console.log(`✓ Se escribió CONTRIBUTORS.md en: ${mdPath}`);

})().catch(err => {
  console.error('Error general:', err);
});
