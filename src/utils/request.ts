import { ShardusTypes } from '@shardus/core'
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import { Utils as StringUtils } from '@shardus/lib-types'

export const shardusGet = async <ResponseType>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<ResponseType>> => {
  const response = await axios.get<ResponseType>(url, {
    ...config,
    transformResponse: (res) => {
      return StringUtils.safeJsonParse(res)
    },
  })
  return response
}

export const shardusPost = async <ResponseType>(url: string, data: unknown, config: AxiosRequestConfig): Promise<AxiosResponse<ResponseType>> => {
  const response = await axios.post<ResponseType>(url, data, config)
  return response
}

export const shardusPut = async <ResponseType>(url: string, data: unknown, config: AxiosRequestConfig): Promise<AxiosResponse<ResponseType>> => {
  const response = await axios.put<ResponseType>(url, data, config)
  return response
}

function containsProtocol(url: string): boolean {
  if (!url.match('https?://*')) return false
  return true
}

function normalizeUrl(url: string): string {
  let normalized = url
  if (!containsProtocol(url)) normalized = 'http://' + url
  return normalized
}

const urlFromNode = (node: ShardusTypes.ValidatorNodeDetails, path: string): string => {
  const host = normalizeUrl(`${node.ip}:${node.port}`)
  const url = `${host}${path}`
  return url
}

/**
 * Perform a GET request on the specified node
 * @param node
 * @param path path prefixed with /
 * @param config
 * @returns
 */
export const shardusGetFromNode = async <ResponseType>(
  node: ShardusTypes.ValidatorNodeDetails,
  path: string,
  config?: AxiosRequestConfig,
): Promise<AxiosResponse<ResponseType>> => {
  const url = urlFromNode(node, path)
  return shardusGet<ResponseType>(url, config)
}

/**
 * Perform a POST request on the specified node
 * @param node
 * @param path path prefixed with /
 * @param config
 * @returns
 */
export const shardusPostToNode = async <ResponseType>(
  node: ShardusTypes.ValidatorNodeDetails,
  path: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<AxiosResponse<ResponseType>> => {
  const url = urlFromNode(node, path)
  return shardusPost<ResponseType>(url, data, config)
}

/**
 * Perform a PUT request on the specified node
 * @param node
 * @param path path prefixed with /
 * @param config
 * @returns
 */
export const shardusPutToNode = async <ResponseType>(
  node: ShardusTypes.ValidatorNodeDetails,
  path: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<AxiosResponse<ResponseType>> => {
  const url = urlFromNode(node, path)
  return shardusPut<ResponseType>(url, data, config)
}
