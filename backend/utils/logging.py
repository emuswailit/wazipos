import logging
def create_log(level, message):
    logger = logging.getLogger("wazi log")
    if level=="critical":
        logger.critical(message)
        return
    elif level=="debug":
        logger.debug(message)
        return
    elif level=="info":
        logger.info(message)
        return
    elif level=="error":
        logger.error(message)
        return
    elif level=="warning":
        logger.warning(message)
        return
    
