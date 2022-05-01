import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDBDocumentClient } from '../utils/dynamoDbClient';

export const handler: APIGatewayProxyHandler = async (event) => {
  const { id } = event.pathParameters;

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

  if (userCertificate) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Certificado válido',
        data: {
          userCertificate,
          url: `https://renato-certificate-ignite-serverless.s3.amazonaws.com/${id}.pdf`,
        },
      }),
    };
  }

  return {
    statusCode: 400,
    body: JSON.stringify({
      success: false,
      message: 'Certificado inválido',
    }),
  };
};
