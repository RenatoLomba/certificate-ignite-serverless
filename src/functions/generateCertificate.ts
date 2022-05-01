import dayjs from 'dayjs';
import { join } from 'path';
import { S3 } from 'aws-sdk';
import { readFileSync } from 'fs';
import handlebars from 'handlebars';
import chromium from 'chrome-aws-lambda';
import { APIGatewayProxyHandler } from 'aws-lambda';

import { dynamoDBDocumentClient } from '../utils/dynamoDbClient';
import { Browser } from 'puppeteer-core';

interface CreateCertificateBody {
  id: string;
  name: string;
  grade: string;
}

interface CompileTemplateParams {
  id: string;
  name: string;
  grade: string;
  medal: string;
  date: string;
}

const compileTemplate = async (data: CompileTemplateParams) => {
  const filePath = join(process.cwd(), 'src', 'templates', 'certificate.hbs');

  const html = readFileSync(filePath, 'utf-8');

  return handlebars.compile(html)(data);
};

export const handler: APIGatewayProxyHandler = async (event) => {
  const { id, name, grade } = JSON.parse(event.body) as CreateCertificateBody;

  const response = await dynamoDBDocumentClient
    .query({
      TableName: 'users_certificate',
      KeyConditionExpression: 'id = :id',
      ExpressionAttributeValues: {
        ':id': id,
      },
    })
    .promise();

  const userCertificate = response.Items[0];

  const dateNow = dayjs();

  if (!userCertificate) {
    await dynamoDBDocumentClient
      .put({
        TableName: 'users_certificate',
        Item: {
          id,
          name,
          grade,
          created_at: dateNow.toISOString(),
        },
      })
      .promise();
  }

  const medalPath = join(process.cwd(), 'src', 'templates', 'selo.png');
  const medal = readFileSync(medalPath, 'base64');

  const date = userCertificate ? dayjs(userCertificate.created_at) : dateNow;

  const content = await compileTemplate({
    id,
    name,
    grade,
    date: date.format('DD/MM/YYYY'),
    medal,
  });

  let browser: Browser | null = null;

  try {
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
    });

    const page = await browser.newPage();
    const loaded = page.waitForNavigation({
      waitUntil: 'load',
    });

    await page.setContent(content);
    await loaded;

    const isOffline = () => process.env.IS_OFFLINE;

    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      path: isOffline() ? './certificate.pdf' : null,
    });

    const s3 = new S3();

    await s3
      .putObject({
        Bucket: 'renato-certificate-ignite-serverless',
        Key: `${id}.pdf`,
        ACL: 'public-read',
        Body: pdf,
        ContentType: 'application/pdf',
      })
      .promise();
  } catch (err) {
    console.log(err);
  } finally {
    await browser?.close();
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Certificado criado com sucesso!',
      success: true,
      data: {
        url: `https://renato-certificate-ignite-serverless.s3.amazonaws.com/${id}.pdf`,
      },
    }),
  };
};
